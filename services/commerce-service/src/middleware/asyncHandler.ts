import type { NextFunction, Request, RequestHandler, Response, Router } from 'express';

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => unknown | Promise<unknown>;
type RouteLayer = { handle: RequestHandler };
type RouterLayer = { route?: { stack?: RouteLayer[] } };

export function asyncHandler(handler: AsyncRouteHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function wrapAsyncRouter<T extends Router>(router: T): T {
  const stack = (router as Router & { stack?: RouterLayer[] }).stack ?? [];
  for (const layer of stack) {
    for (const routeLayer of layer.route?.stack ?? []) {
      routeLayer.handle = asyncHandler(routeLayer.handle);
    }
  }
  return router;
}
