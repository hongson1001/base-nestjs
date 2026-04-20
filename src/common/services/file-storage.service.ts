import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import { randomUUID } from 'crypto';

export interface UploadResult {
  key: string; // Original file key
  thumbnailKey?: string; // 150x150 WebP
  mediumKey?: string; // 600x600 WebP
}

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

/**
 * File storage — S3-compatible (MinIO dev / Cloudflare R2 prod).
 *
 * - upload(): lưu file gốc + tự tạo thumbnail (150x150) + medium (600x600) WebP nếu là ảnh.
 * - getSignedUrls(): batch sign, trả về map key → URL (giữ nguyên mapping).
 * - deleteFolder(): xoá toàn bộ object theo prefix (dùng khi xoá entity).
 */
@Injectable()
export class FileStorageService implements OnModuleInit {
  private readonly logger = new Logger(FileStorageService.name);
  private s3Client!: S3Client;
  private bucket!: string;
  private signedUrlExpires!: number;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.bucket = this.configService.get<string>('S3_BUCKET', 'my-media');
    this.signedUrlExpires = Number(
      this.configService.get<number>('S3_SIGNED_URL_EXPIRES', 3600),
    );

    const endpoint = this.configService.get<string>('S3_ENDPOINT', '');

    this.s3Client = new S3Client({
      endpoint,
      region: this.configService.get<string>('S3_REGION', 'us-east-1'),
      forcePathStyle: this.resolveForcePathStyle(endpoint),
      credentials: {
        accessKeyId: this.configService.get<string>('S3_ACCESS_KEY', ''),
        secretAccessKey: this.configService.get<string>('S3_SECRET_KEY', ''),
      },
    });
  }

  /**
   * Providers that require virtual-hosted addressing (path-style OFF):
   *   - Cloudflare R2 (*.r2.cloudflarestorage.com)
   *   - DigitalOcean Spaces (*.digitaloceanspaces.com)
   *   - AWS S3 (default)
   * MinIO and most self-hosted S3-clones require path-style (ON).
   * Explicit S3_FORCE_PATH_STYLE env overrides auto-detection when set.
   */
  private resolveForcePathStyle(endpoint: string): boolean {
    const explicit = this.configService.get<string>('S3_FORCE_PATH_STYLE');
    if (explicit !== undefined && explicit !== '') {
      return explicit === 'true' || explicit === '1';
    }
    const e = endpoint.toLowerCase();
    const isVirtualHosted =
      e.includes('r2.cloudflarestorage.com') ||
      e.includes('digitaloceanspaces.com') ||
      e.includes('amazonaws.com');
    return !isVirtualHosted;
  }

  /**
   * Upload file → tự sinh key `{folder}/{entityId}/{uuid}.{ext}`.
   * Nếu là ảnh: tự tạo thumbnail (150x150) + medium (600x600) WebP.
   */
  async upload(
    buffer: Buffer,
    folder: string,
    entityId: string,
    mimeType: string,
  ): Promise<UploadResult> {
    const id = randomUUID();
    const ext = MIME_TO_EXT[mimeType] ?? 'bin';
    const key = `${folder}/${entityId}/${id}.${ext}`;

    // Upload file gốc
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );

    const result: UploadResult = { key };

    // Nếu là ảnh → tạo thumbnail + medium
    if (mimeType.startsWith('image/')) {
      const variants: Array<{
        width: number;
        height: number;
        suffix: 'thumb' | 'medium';
      }> = [
        { width: 150, height: 150, suffix: 'thumb' },
        { width: 600, height: 600, suffix: 'medium' },
      ];

      for (const v of variants) {
        const resized = await sharp(buffer)
          .resize(v.width, v.height, { fit: 'inside' })
          .webp({ quality: 80 })
          .toBuffer();

        const variantKey = `${folder}/${entityId}/${id}_${v.suffix}.webp`;
        await this.s3Client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: variantKey,
            Body: resized,
            ContentType: 'image/webp',
          }),
        );

        if (v.suffix === 'thumb') result.thumbnailKey = variantKey;
        if (v.suffix === 'medium') result.mediumKey = variantKey;
      }
    }

    this.logger.debug(`Uploaded: ${key}`);
    return result;
  }

  async delete(key: string): Promise<void> {
    await this.s3Client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    this.logger.debug(`Deleted: ${key}`);
  }

  /**
   * Sinh signed URL cho 1 key.
   */
  async getSignedUrl(key: string, expiresIn?: number): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    try {
      return await getSignedUrl(this.s3Client, command, {
        expiresIn: expiresIn ?? this.signedUrlExpires,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to sign URL for key "${key}": ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Batch sign — trả về map { key → signed URL }.
   * Keys that fail to sign are omitted from the result (with a warn log);
   * the caller gets a partial map instead of the whole batch throwing.
   */
  async getSignedUrls(
    keys: string[],
    expiresIn?: number,
  ): Promise<Record<string, string>> {
    const entries = await Promise.all(
      keys.map(async (key) => {
        try {
          const url = await this.getSignedUrl(key, expiresIn);
          return [key, url] as const;
        } catch {
          return null;
        }
      }),
    );
    const result: Record<string, string> = {};
    for (const entry of entries) {
      if (entry) result[entry[0]] = entry[1];
    }
    return result;
  }

  /**
   * Xoá toàn bộ object trong folder `{folder}/{entityId}/`.
   */
  async deleteFolder(folder: string, entityId: string): Promise<void> {
    const prefix = `${folder}/${entityId}/`;
    const listed = await this.s3Client.send(
      new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix }),
    );
    const objects = listed.Contents;
    if (!objects || objects.length === 0) return;

    await this.s3Client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: {
          Objects: objects.map((obj) => ({ Key: obj.Key! })),
          Quiet: true,
        },
      }),
    );
    this.logger.debug(`Deleted folder: ${prefix} (${objects.length} objects)`);
  }
}
