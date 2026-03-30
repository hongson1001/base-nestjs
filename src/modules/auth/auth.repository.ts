import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type UpdateQuery } from 'mongoose';
import { User, type UserDocument } from './schemas/user.schema.js';
import {
  MAX_LOGIN_ATTEMPTS,
  LOCKOUT_DURATION_MS,
} from '../../common/constants/security.js';

@Injectable()
export class AuthRepository {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: email.toLowerCase(), isDeleted: false })
      .exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ _id: id, isDeleted: false }).exec();
  }

  async createUser(data: Partial<User>): Promise<UserDocument> {
    const doc = new this.userModel(data);
    return doc.save();
  }

  async updateUser(
    id: string,
    data: Partial<User>,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(id, { $set: data }, { new: true })
      .exec();
  }

  async incrementLoginAttempts(id: string): Promise<UserDocument | null> {
    const user = await this.userModel.findById(id).exec();

    const update: UpdateQuery<User> = {
      $inc: { loginAttempts: 1 },
    };

    if (user && user.loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS) {
      update.$set = {
        lockUntil: new Date(Date.now() + LOCKOUT_DURATION_MS),
      };
    }

    return this.userModel.findByIdAndUpdate(id, update, { new: true }).exec();
  }

  async resetLoginAttempts(id: string): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(
        id,
        { $set: { loginAttempts: 0 }, $unset: { lockUntil: 1 } },
        { new: true },
      )
      .exec();
  }

  async updateLastLogin(id: string): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(
        id,
        { $set: { lastLoginAt: new Date() } },
        { new: true },
      )
      .exec();
  }

  async updateRefreshToken(
    id: string,
    hashedToken: string | null,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(
        id,
        { $set: { refreshToken: hashedToken } },
        { new: true },
      )
      .exec();
  }
}
