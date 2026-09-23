import {
  Controller,
  Post,
  Body,
  Res,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterInvitedDto } from './dto/register-invited.dto';
import { LoginDto } from './dto/login.dto';
import type { Response } from 'express';
import { JwtRefreshGuard } from 'src/guards/jwt-refresh.guard';
import { JwtAuthGuard } from 'src/guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(
    @Body() registerDto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } = await this.authService.register(registerDto);
    this.setCookies(res, tokens.accessToken, tokens.refreshToken);
    const { passwordHash, hashedRefreshToken, ...userWithoutSensitiveInfo } =
      user;
    return userWithoutSensitiveInfo;
  }

  @Post('register-invited')
  async registerInvited(
    @Query('token') token: string,
    @Body() registerInvitedDto: RegisterInvitedDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } = await this.authService.registerInvited(
      token,
      registerInvitedDto,
    );
    this.setCookies(res, tokens.accessToken, tokens.refreshToken);
    const { passwordHash, hashedRefreshToken, ...userWithoutSensitiveInfo } =
      user;
    return userWithoutSensitiveInfo;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, tokens } = await this.authService.login(loginDto);
    this.setCookies(res, tokens.accessToken, tokens.refreshToken);
    const { passwordHash, hashedRefreshToken, ...userWithoutSensitiveInfo } =
      user;
    return userWithoutSensitiveInfo;
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(req.user.id);
    res.clearCookie('Authentication', this.cookieOptions);
    res.clearCookie('Refresh', this.cookieOptions);
    return { message: 'Logged out successfully' };
  }

  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.refreshTokens(
      req.user.id,
      req.user.refreshToken,
    );
    this.setCookies(res, tokens.accessToken, tokens.refreshToken);
    return { message: 'Tokens refreshed' };
  }

  private setCookies(res: Response, accessToken: string, refreshToken: string) {
    res.cookie('Authentication', accessToken, {
      ...this.cookieOptions,
      httpOnly: true,
      maxAge: 15 * 60 * 1000, // 15 minutes
    });
    res.cookie('Refresh', refreshToken, {
      ...this.cookieOptions,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }

  private get cookieOptions() {
    return {
      path: '/',
      // The Vercel frontend and Prisma API are cross-site, so production
      // browsers require SameSite=None and Secure for the auth cookies.
      sameSite:
        process.env.NODE_ENV === 'production'
          ? ('none' as const)
          : ('lax' as const),
      secure: process.env.NODE_ENV === 'production',
    };
  }
}
