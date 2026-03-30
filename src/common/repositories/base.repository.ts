import type {
  QueryFilter,
  Model,
  ProjectionType,
  QueryOptions,
  UpdateQuery,
  Query,
} from 'mongoose';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface FindAllOptions<T> {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  projection?: ProjectionType<T>;
  populate?: string | string[];
}

export class BaseRepository<T> {
  constructor(protected readonly model: Model<T>) {}

  async findAll(
    filter: QueryFilter<T> = {},
    options: FindAllOptions<T> = {},
  ): Promise<PaginatedResult<T>> {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      projection,
      populate,
    } = options;

    const safeFilter: QueryFilter<T> = {
      ...filter,
      isDeleted: false,
    } as QueryFilter<T>;

    const skip = (page - 1) * limit;
    const sort: Record<string, 1 | -1> = {
      [sortBy]: sortOrder === 'asc' ? 1 : -1,
    };

    const [items, total] = await Promise.all([
      this.buildFindAllQuery(
        this.model
          .find(safeFilter, projection)
          .sort(sort)
          .skip(skip)
          .limit(limit),
        populate,
      ),
      this.model.countDocuments(safeFilter),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findById(
    id: string,
    projection?: ProjectionType<T>,
    populate?: string | string[],
  ): Promise<T | null> {
    const query = this.model.findOne(
      { _id: id, isDeleted: false } as QueryFilter<T>,
      projection,
    );
    return this.buildFindOneQuery(query, populate);
  }

  async findOne(
    filter: QueryFilter<T>,
    projection?: ProjectionType<T>,
    populate?: string | string[],
  ): Promise<T | null> {
    const safeFilter: QueryFilter<T> = {
      ...filter,
      isDeleted: false,
    } as QueryFilter<T>;
    const query = this.model.findOne(safeFilter, projection);
    return this.buildFindOneQuery(query, populate);
  }

  async create(data: Partial<T>): Promise<T> {
    const doc = await this.model.create(data);
    return doc.toObject() as T;
  }

  async update(
    id: string,
    data: UpdateQuery<T>,
    options?: QueryOptions<T>,
  ): Promise<T | null> {
    return this.model
      .findOneAndUpdate({ _id: id, isDeleted: false } as QueryFilter<T>, data, {
        new: true,
        ...options,
      })
      .lean<T>()
      .exec();
  }

  async softDelete(id: string): Promise<T | null> {
    return this.model
      .findOneAndUpdate(
        { _id: id, isDeleted: false } as QueryFilter<T>,
        { $set: { isDeleted: true, deletedAt: new Date() } } as UpdateQuery<T>,
        { new: true },
      )
      .lean<T>()
      .exec();
  }

  async count(filter: QueryFilter<T> = {}): Promise<number> {
    const safeFilter: QueryFilter<T> = {
      ...filter,
      isDeleted: false,
    } as QueryFilter<T>;
    return this.model.countDocuments(safeFilter);
  }

  async exists(filter: QueryFilter<T>): Promise<boolean> {
    const safeFilter: QueryFilter<T> = {
      ...filter,
      isDeleted: false,
    } as QueryFilter<T>;
    const doc = await this.model.exists(safeFilter);
    return doc !== null;
  }

  private buildFindAllQuery(
    query: Query<T[], T>,
    populate?: string | string[],
  ): Promise<T[]> {
    if (populate) {
      const fields = Array.isArray(populate) ? populate : [populate];
      for (const field of fields) {
        query = query.populate(field);
      }
    }
    return query.lean<T[]>().exec();
  }

  private buildFindOneQuery(
    query: Query<T | null, T>,
    populate?: string | string[],
  ): Promise<T | null> {
    if (populate) {
      const fields = Array.isArray(populate) ? populate : [populate];
      for (const field of fields) {
        query = query.populate(field);
      }
    }
    return query.lean<T>().exec() as Promise<T | null>;
  }
}
