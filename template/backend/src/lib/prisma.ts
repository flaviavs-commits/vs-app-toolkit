import { PrismaClient } from '@prisma/client'

// Cliente Prisma único e compartilhado por todo o backend.
const prisma = new PrismaClient()

export default prisma
