import { SetMetadata } from '@nestjs/common';

export const SKIP_TWO_FACTOR_KEY = 'skipTwoFactor';

export const SkipTwoFactor = () => SetMetadata(SKIP_TWO_FACTOR_KEY, true);
