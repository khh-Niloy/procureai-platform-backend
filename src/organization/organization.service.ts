import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { InvitePersonDto } from './dto/invite-people.dto';
import { MailService } from 'src/mail/mail.service';
import * as crypto from 'crypto';

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async createOrganization(userId: string, dto: CreateOrganizationDto) {
    return this.prisma.$transaction(async (prisma) => {
      const org = await prisma.organization.create({
        data: {
          name: dto.name,
        },
      });

      await prisma.user.update({
        where: { id: userId },
        data: { organizationId: org.id },
      });

      return org;
    });
  }

  async invitePeople(organizationId: string, invites: InvitePersonDto[]) {
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
      );
    }

    return { message: 'Invitations sent successfully' };
  }

  async acceptInvitation(token: string) {
    const invitation = await this.prisma.organizationInvitation.findUnique({
      where: { token },
      include: { organization: true },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.acceptedAt) {
      throw new BadRequestException('Invitation has already been accepted');
    }

    if (new Date() > invitation.expiresAt) {
      throw new BadRequestException('Invitation has expired');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: invitation.email },
    });

    if (!user) {
      throw new NotFoundException({
        message: 'User not found. Please register to accept.',
        email: invitation.email,
        token: token,
      });
    }

    await this.prisma.$transaction(async (prisma) => {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          organizationId: invitation.organizationId,
          role: invitation.role,
        },
      });

      await prisma.organizationInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
    });

    return { message: 'Successfully joined organization' };
  }

  async getMyOrganization(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    return org;
  }
}
