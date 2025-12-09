/**
 * Root Middleware
 *
 * Defines middlewares shared by all routes.
 */

import { define } from "@/utils.ts";
import { accessControlMiddlewareHandler } from "@/features/auth/access-control-middleware.ts";

const accessControlMiddleware = define.middleware(
  accessControlMiddlewareHandler,
);

export default [accessControlMiddleware];
