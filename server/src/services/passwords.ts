import bcrypt from "bcrypt";

const saltRounds = 12;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(password: string, passwordHash: string) {
  if (!passwordHash.startsWith("$2")) {
    return false;
  }

  return bcrypt.compare(password, passwordHash);
}
