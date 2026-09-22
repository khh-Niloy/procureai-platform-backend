import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { InvitePersonDto } from './dto/invite-people.dto';
import { MailService } from 'src/mail/mail.service';
import * as crypto from 'crypto';

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async invitePeople(
    organizationId: string,
    invites: InvitePersonDto[],
    replyTo: string,
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 72); // 72 hours expiration

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    for (const invite of invites) {
      const token = crypto.randomBytes(32).toString('hex');

      await this.prisma.organizationInvitation.create({
        data: {
          organizationId,
          email: invite.email,
          role: invite.role,
          token,
          expiresAt,
        },
      });

      const inviteLink = `${frontendUrl}/accept-invitation?token=${token}`;
      await this.mailService.sendInvitationEmail(
        invite.email,
        org.name,
        inviteLink,
        replyTo,
      );
    }

    return { message: 'Invitations sent successfully' };
  }

  async getOrganizationUsers(organizationId: string) {
    return this.prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
      orderBy: { name: 'asc' },
    });
  }
}
