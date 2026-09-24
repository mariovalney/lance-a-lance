import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env.js";

let transporter: Transporter | null = null;

function mailer(): Transporter | null {
  if (!env.smtp) return null;
  transporter ??= nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    // 465 is implicit TLS; everything else starts plain and upgrades.
    secure: env.smtp.port === 465,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  });
  return transporter;
}

export const canSendMail = (): boolean => Boolean(env.smtp);

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * The reset link. Written in Portuguese, plain, with no tracking and no
 * images: it has to survive a phone's mail app and a strict spam filter.
 */
export async function sendPasswordReset(to: string, link: string, validForMinutes: number): Promise<void> {
  const mail = mailer();
  if (!mail || !env.smtp) throw new Error("SMTP is not configured");

  const text = [
    "Você pediu para redefinir a senha do Lance a Lance.",
    "",
    `Abra este endereço para escolher uma senha nova. Ele vale por ${validForMinutes} minutos e só pode ser usado uma vez:`,
    "",
    link,
    "",
    "Se não foi você, pode ignorar este e-mail. Sua senha continua a mesma.",
  ].join("\n");

  const html = [
    '<div style="font-family: system-ui, sans-serif; font-size: 15px; line-height: 1.5; color: #14181f">',
    "<p>Você pediu para redefinir a senha do <strong>Lance a Lance</strong>.</p>",
    `<p>Abra este endereço para escolher uma senha nova. Ele vale por ${validForMinutes} minutos e só pode ser usado uma vez:</p>`,
    `<p><a href="${escapeHtml(link)}" style="color: #2f4fd4">${escapeHtml(link)}</a></p>`,
    "<p style=\"color: #5a6474\">Se não foi você, pode ignorar este e-mail. Sua senha continua a mesma.</p>",
    "</div>",
  ].join("");

  await mail.sendMail({ from: env.smtp.from, to, subject: "Redefinir a senha do Lance a Lance", text, html });
}
