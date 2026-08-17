import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

// Reaproveita uma única instância por processo/warm function. Isso reduz a
// criação desnecessária de pools de conexão em ambientes serverless.
export const prisma = globalForPrisma.prisma ?? new PrismaClient()

globalForPrisma.prisma = prisma
