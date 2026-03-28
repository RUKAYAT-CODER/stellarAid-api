import * as Joi from 'joi';

export const validationSchema = Joi.object({
  PORT: Joi.number().default(3000),

  DATABASE_URL: Joi.string().uri().required(),

  JWT_SECRET: Joi.string().min(10).required(),
  JWT_EXPIRES_IN: Joi.string().default('1d'),

  STELLAR_NETWORK: Joi.string().valid('TESTNET', 'PUBLIC').required(),

  STELLAR_HORIZON_URL: Joi.string().uri().required(),

  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  ENABLE_SWAGGER: Joi.boolean().default(false),

  /** Percent of each donation counted as platform fee (0–100). Optional; defaults to 0. */
  PLATFORM_FEE_PERCENT: Joi.number().min(0).max(100).optional(),
});
