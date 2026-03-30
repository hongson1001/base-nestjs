import {
  IsNotEmpty,
  IsString,
  MinLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'PasswordsMatch', async: false })
class PasswordsMatchConstraint implements ValidatorConstraintInterface {
  validate(_value: string, args: ValidationArguments): boolean {
    const obj = args.object as ChangePasswordDto;
    return obj.confirmPassword === obj.newPassword;
  }

  defaultMessage(): string {
    return 'confirmPassword must match newPassword';
  }
}

@ValidatorConstraint({ name: 'NewPasswordDifferent', async: false })
class NewPasswordDifferentConstraint implements ValidatorConstraintInterface {
  validate(value: string, args: ValidationArguments): boolean {
    const obj = args.object as ChangePasswordDto;
    return value !== obj.currentPassword;
  }

  defaultMessage(): string {
    return 'New password must be different from the current password';
  }
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Current password is required' })
  currentPassword: string;

  @IsString()
  @MinLength(8, {
    message: 'New password must be at least 8 characters long',
  })
  @Validate(NewPasswordDifferentConstraint)
  newPassword: string;

  @IsString()
  @IsNotEmpty({ message: 'Confirm password is required' })
  @Validate(PasswordsMatchConstraint)
  confirmPassword: string;
}
