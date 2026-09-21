import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { OrganizationModule } from './organization/organization.module';
import { MailModule } from './mail/mail.module';
import { VendorModule } from './vendor/vendor.module';
import { PurchaseRequestModule } from './purchase-request/purchase-request.module';

@Module({
  imports: [PrismaModule, AuthModule, UserModule, OrganizationModule, MailModule, VendorModule, PurchaseRequestModule],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
