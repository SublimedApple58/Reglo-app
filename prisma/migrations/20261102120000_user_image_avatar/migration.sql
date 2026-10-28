-- REG-639 giro Road: copia avatar 512 px della foto profilo (additiva, nullable).
ALTER TABLE "User" ADD COLUMN "imageAvatar" TEXT;
