import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { config } from '../config';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.port === 465,
      auth: {
        user: config.mail.user,
        pass: config.mail.pass,
      },
    });
  }

  async sendInvitationEmail(
    to: string,
    organizationName: string,
    inviteLink: string,
    replyTo: string,
  ) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>You've been invited to join ${organizationName} on ProcureAI!</h2>
        <p>You have been invited to join your team on ProcureAI. Click the button below to accept the invitation.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${inviteLink}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Accept Invitation</a>
        </div>
        <p style="color: #666; font-size: 14px;">If you're having trouble clicking the button, copy and paste this URL into your browser:</p>
        <p style="color: #666; font-size: 14px; word-break: break-all;">${inviteLink}</p>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: config.mail.from,
        replyTo,
        to,
        subject: `Invitation to join ${organizationName}`,
        html,
      });
      this.logger.log(`Invitation email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}`, error);
      throw error;
    }
  }
}
