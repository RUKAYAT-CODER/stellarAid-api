import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as ejs from 'ejs';
import * as nodemailer from 'nodemailer';

interface User {
  email: string;
  firstName?: string;
  username?: string;
}

interface LoginMetadata {
  ip?: string;
  device?: string;
  time?: Date;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly templatesPath = path.join(__dirname, 'templates');

  constructor(private configService: ConfigService) {}

  async sendWelcomeEmail(user: User): Promise<void> {
    try {
      const templatePath = path.join(this.templatesPath, 'welcome.ejs');
      const template = fs.readFileSync(templatePath, 'utf-8');

      const templateData = {
        firstName: user.firstName,
        username: user.username,
        appName: this.configService.get<string>('APP_NAME', 'StellarAid'),
        currentDate: new Date().toLocaleDateString(),
        currentYear: new Date().getFullYear(),
        loginUrl: `${this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000')}/login`,
      };

      const html = await ejs.render(template, templateData);

      const mailOptions = {
        from: this.configService.get<string>(
          'MAIL_FROM',
          'noreply@stellaraid.com',
        ),
        to: user.email,
        subject: `${this.configService.get<string>('MAIL_SUBJECT_PREFIX', '[StellarAid]')} Welcome to ${templateData.appName}!`,
        html,
      };

      await this.sendMail(mailOptions);
      this.logger.log(
        `Welcome email sent successfully to: ${this.maskEmail(user.email)}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send welcome email to ${this.maskEmail(user.email)}:`,
        error.message,
      );
      throw error;
    }
  }

  async sendLoginEmail(user: User, metadata?: LoginMetadata): Promise<void> {
    try {
      const templatePath = path.join(this.templatesPath, 'login.ejs');
      const template = fs.readFileSync(templatePath, 'utf-8');

      const loginTime = metadata?.time || new Date();
      const templateData = {
        firstName: user.firstName,
        username: user.username,
        appName: this.configService.get<string>('APP_NAME', 'StellarAid'),
        currentDate: new Date().toLocaleDateString(),
        currentYear: new Date().getFullYear(),
        loginDate: loginTime.toLocaleDateString(),
        loginTime: loginTime.toLocaleTimeString(),
        ipAddress: metadata?.ip,
        deviceInfo: metadata?.device,
        changePasswordUrl: `${this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000')}/change-password`,
      };

      const html = await ejs.render(template, templateData);

      const mailOptions = {
        from: this.configService.get<string>(
          'MAIL_FROM',
          'noreply@stellaraid.com',
        ),
        to: user.email,
        subject: `${this.configService.get<string>('MAIL_SUBJECT_PREFIX', '[StellarAid]')} New Login Notification`,
        html,
      };

      await this.sendMail(mailOptions);
      this.logger.log(
        `Login notification email sent successfully to: ${this.maskEmail(user.email)}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send login email to ${this.maskEmail(user.email)}:`,
        error.message,
      );
      throw error;
    }
  }

  async sendDonationConfirmationEmail(
    userEmail: string,
    firstName: string,
    donationData: {
      projectName: string;
      amount: number;
      assetType: string;
      transactionHash: string;
      projectId: string;
    },
  ): Promise<void> {
    try {
      const templatePath = path.join(this.templatesPath, 'donation-confirmation.ejs');
      const template = fs.readFileSync(templatePath, 'utf-8');

      const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
      const templateData = {
        firstName,
        appName: this.configService.get<string>('APP_NAME', 'StellarAid'),
        projectName: donationData.projectName,
        amount: donationData.amount,
        assetType: donationData.assetType,
        transactionHash: donationData.transactionHash,
        donationDate: new Date().toLocaleDateString(),
        currentDate: new Date().toLocaleDateString(),
        currentYear: new Date().getFullYear(),
        projectViewUrl: `${frontendUrl}/projects/${donationData.projectId}`,
      };

      const html = await ejs.render(template, templateData);

      const mailOptions = {
        from: this.configService.get<string>(
          'MAIL_FROM',
          'noreply@stellaraid.com',
        ),
        to: userEmail,
        subject: `${this.configService.get<string>('MAIL_SUBJECT_PREFIX', '[StellarAid]')} Your Donation Confirmation`,
        html,
      };

      await this.sendMail(mailOptions);
      this.logger.log(
        `Donation confirmation email sent successfully to: ${this.maskEmail(userEmail)}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send donation confirmation email to ${this.maskEmail(userEmail)}:`,
        error.message,
      );
      // Don't throw - email failures shouldn't block the donation process
      // Just log the error for debugging
    }
  }

  private async sendMail(mailOptions: any): Promise<void> {
    try {
      // Create transporter using environment configuration
      const transporter = nodemailer.createTransport({
        host: this.configService.get<string>('MAIL_HOST', 'smtp.gmail.com'),
        port: this.configService.get<number>('MAIL_PORT', 587),
        secure: this.configService.get<boolean>('MAIL_SECURE', false),
        auth: {
          user: this.configService.get<string>('MAIL_USER'),
          pass: this.configService.get<string>('MAIL_PASS'),
        },
      });

      this.logger.debug('Sending email with options:', {
        from: mailOptions.from,
        to: this.maskEmail(mailOptions.to),
        subject: mailOptions.subject,
      });

      await transporter.sendMail(mailOptions);
      this.logger.debug('Email sent successfully');
    } catch (error) {
      this.logger.error('Failed to send email:', error.message);
      throw error;
    }
  }

  private maskEmail(email: string): string {
    if (!email) return 'unknown';
    const [username, domain] = email.split('@');
    if (username.length <= 2) {
      return `${username[0]}*@${domain}`;
    }
    return `${username.slice(0, 2)}***@${domain}`;
  }
}
