import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "edu-center-jwt-secret-change-in-prod";

export interface JwtPayload {
  id: string;
  username: string;
  isActive?: boolean;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function requireAuth(req: any, res: any, next: any) {
  if (req.session?.userId) {
    return next();
  }

  const authHeader = req.headers["authorization"] as string | undefined;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
      if (!req.session) req.session = {} as any;
      req.session.userId = payload.id;
      return next();
    } catch {
      return res.status(401).json({ message: "Token không hợp lệ hoặc đã hết hạn" });
    }
  }

  return res.status(401).json({ message: "Chưa đăng nhập" });
}
