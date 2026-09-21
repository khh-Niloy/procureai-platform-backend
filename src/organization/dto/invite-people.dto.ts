import { IsEmail, IsEnum, IsNotEmpty } from 'class-validator';
import { Role } from 'src/generated/prisma/enums';

export class InvitePersonDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsEnum(Role)
  @IsNotEmpty()
  role: Role;
}
