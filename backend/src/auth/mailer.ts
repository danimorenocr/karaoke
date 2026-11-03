import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

/**
 * Envio de correos por SMTP. Variables de entorno:
 *   SMTP_HOST (ej. smtp.gmail.com), SMTP_PORT (465 por defecto), SMTP_USER, SMTP_PASS (en Gmail: "contrasena de aplicacion"),
 *   MAIL_FROM (opcional, ej. "TONO <tucorreo@gmail.com>").
 */
@Injectable()
export class Mailer {
  private log = new Logger('Mailer');
  private tx = process.env.SMTP_USER && process.env.SMTP_PASS
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT || 465),
        secure: Number(process.env.SMTP_PORT || 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
    : null;

  get configured() { return !!this.tx; }

  async send(to: string, subject: string, text: string, html: string) {
    if (!this.tx) {
      // Solo en desarrollo: sin SMTP se imprime el correo en la consola del servidor
      if (process.env.NODE_ENV === 'production') throw new ServiceUnavailableException('El envio de correos no esta configurado');
      this.log.warn(`SMTP sin configurar. Correo para ${to}: ${subject}\n${text}`);
      return;
    }
    await this.tx.sendMail({ from: process.env.MAIL_FROM || `TONO <${process.env.SMTP_USER}>`, to, subject, text, html });
  }

  otpEmail(code: string) {
    const text = `Tu codigo para recuperar tu contrasena de TONO es ${code}. Vence en 10 minutos. Si no lo pediste, ignora este correo.`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;background:#05060a;color:#f5ecdc;border-radius:16px">
      <h2 style="margin:0 0 8px">Recupera tu contraseña</h2>
      <p style="color:#9aa3b2">Usa este código en TONO. Vence en 10 minutos.</p>
      <p style="font-size:36px;letter-spacing:10px;font-weight:800;color:#a9b8ff;margin:18px 0">${code}</p>
      <p style="color:#9aa3b2;font-size:12px">Si no lo pediste, ignora este correo: tu contraseña no cambia.</p></div>`;
    return { subject: `${code} es tu código de TONO`, text, html };
  }
}
