import 'reflect-metadata';
import { hash as passwordHash } from 'argon2';
import { Database } from '../src/prisma.service';
import { config } from '../src/config';

void config;
const mode=process.argv[2];
const email=process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password=process.env.ADMIN_PASSWORD;
if(!['create','create-consulta','password'].includes(mode)||!email||!password||password.length<16) throw new Error('Defina ADMIN_EMAIL e ADMIN_PASSWORD (mínimo 16 caracteres) no ambiente; use create, create-consulta ou password.');
const db=new Database();
async function main() {try {
  if (!email || !password) throw new Error('Credenciais administrativas ausentes');
  const hashed=await passwordHash(password,{type:2});
  if(mode==='create'||mode==='create-consulta') {
    const role=mode==='create'?'ADMIN':'CONSULTA';
    await db.adminUser.upsert({where:{email},create:{email,passwordHash:hashed,role},update:{}});
  } else {
    await db.$transaction(async tx=>{
      const user=await tx.adminUser.update({where:{email},data:{passwordHash:hashed}});
      await tx.adminSession.updateMany({where:{userId:user.id,revokedAt:null},data:{revokedAt:new Date()}});
      await tx.auditLog.create({data:{actorId:user.id,action:'PASSWORD_RESET_LOCAL',entityType:'AdminUser',entityId:user.id}});
    });
  }
  process.stdout.write(mode==='password'?'Senha redefinida; sessões invalidadas.\n':'Acesso verificado.\n');
} finally {await db.$disconnect();}}
void main();
