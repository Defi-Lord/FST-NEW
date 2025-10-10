import 'dotenv/config'
const must = (k: string) => {
  const v = process.env[k]
  if (!v) throw new Error(`Missing env ${k}`)
  return v
}
export const ENV = {
  PORT: Number(process.env.PORT || 8080),
  DATABASE_URL: must('DATABASE_URL'),
  JWT_SECRET: must('JWT_SECRET'),
}
