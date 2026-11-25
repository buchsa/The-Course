import nodemailer, { type Transporter } from 'nodemailer';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { EVENT_INFO, PROTEA_HOTEL_OFFER, formatUgx } from '../src/data/eventData.ts';
import type { OrderRecord } from './checkoutService.ts';

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

let cachedTransporter: Transporter | null = null;
let cachedTransporterKey = '';

function getSmtpConfig(): SmtpConfig | null {
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || '').trim();
  if (!user || !pass) {
    return null;
  }

  const host = (process.env.SMTP_HOST || 'smtp.hostinger.com').trim();
  const rawPort = Number.parseInt((process.env.SMTP_PORT || '465').trim(), 10);
  const port = Number.isInteger(rawPort) && rawPort > 0 && rawPort <= 65535 ? rawPort : 465;
  const secureEnv = (process.env.SMTP_SECURE || '').trim().toLowerCase();
  const secure = secureEnv ? secureEnv === 'true' : port === 465;
  const from = (process.env.SMTP_FROM || `"The Course" <${user}>`).trim();

  return { host, port, secure, user, pass, from };
}

function getTransporter(config: SmtpConfig): Transporter {
  const key = `${config.host}:${config.port}:${config.secure}:${config.user}:${config.pass}`;
  if (cachedTransporter && cachedTransporterKey === key) {
    return cachedTransporter;
  }
  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
  cachedTransporterKey = key;
  return cachedTransporter;
}

export function isEmailDeliveryConfigured(): boolean {
  return Boolean(getSmtpConfig());
}

function isSafeEmailAddress(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed || trimmed.length > 254) return false;
  if (/[\r\n]/.test(trimmed)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatReadableDate(iso?: string): string {
  if (!iso) return 'Verified';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString('en-UG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export async function generateTicketPdfBuffer(order: OrderRecord): Promise<Buffer> {
  const qrPayload = JSON.stringify({
    passCode: order.passCode || order.orderId,
    ref: order.orderId,
    protea50: order.hotelVoucherCode,
    bankRef: order.credit?.bankRef,
    externalRef: order.credit?.externalRef,
    event: 'The Course 2026',
    name: order.fullName,
    phone: order.phone,
    pass: order.tier.name,
    qty: order.quantity,
    total: order.totalUgx,
  });

  const qrBuffer = await QRCode.toBuffer(qrPayload, {
    width: 320,
    margin: 1,
    color: {
      dark: '#0E3B24',
      light: '#FFFFFF',
    },
  });

  const patronsAdmitted = order.tier.guestsIncluded * order.quantity;
  const paymentMethod = order.credit?.paymentMethod || order.selectedMethodLabel || 'Verified Checkout';
  const bankRef = order.credit?.bankRef || 'Verified';

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 44,
      info: {
        Title: `The Course 2026 Pass - ${order.passCode || order.orderId}`,
        Author: EVENT_INFO.organiser,
        Subject: 'Official Drive-in Patron Pass',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - 88;
    const leftX = 44;

    // Warm cream background
    doc.rect(0, 0, pageWidth, doc.page.height).fill('#FAF8F3');

    // Deep forest green header banner
    doc.roundedRect(leftX, 44, contentWidth, 110, 12).fill('#0E3B24');
    doc.fillColor('#E2CB7A').font('Helvetica-Bold').fontSize(10).text("THE COURSE · A PATRONS' GATHERING", leftX + 24, 62, {
      width: contentWidth - 48,
      characterSpacing: 1.2,
    });
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(22).text('Official Drive-in Patron Pass', leftX + 24, 82, {
      width: contentWidth - 48,
    });
    doc.fillColor('#FAF8F3').font('Helvetica').fontSize(10.5).text(
      `${EVENT_INFO.dateLabel}  ·  ${EVENT_INFO.venue}`,
      leftX + 24,
      114,
      { width: contentWidth - 48 }
    );
    doc.fillColor('#E2CB7A').font('Helvetica-Oblique').fontSize(9.5).text(
      'An arrangement of taste and tone — Inclusive of Endless Barbecue',
      leftX + 24,
      131,
      { width: contentWidth - 48 }
    );

    // Main ticket card
    const cardTop = 172;
    const cardHeight = 348;
    doc.roundedRect(leftX, cardTop, contentWidth, cardHeight, 12).fillAndStroke('#FFFFFF', '#D5DDD7');

    // Pass badge bar
    doc.fillColor('#0E3B24').font('Helvetica-Bold').fontSize(9.5).text('PASS CODE', leftX + 24, cardTop + 20);
    doc.fillColor('#0E3B24').font('Courier-Bold').fontSize(16).text(order.passCode || order.orderId, leftX + 24, cardTop + 34);

    doc.fillColor('#5A685E').font('Helvetica-Bold').fontSize(9.5).text('ORDER REFERENCE', leftX + 245, cardTop + 20);
    doc.fillColor('#111D15').font('Courier-Bold').fontSize(12.5).text(order.orderId, leftX + 245, cardTop + 36);

    doc
      .moveTo(leftX + 24, cardTop + 66)
      .lineTo(leftX + contentWidth - 24, cardTop + 66)
      .strokeColor('#E6EAE7')
      .lineWidth(1)
      .stroke();

    // Left details column
    const detailsWidth = contentWidth - 210;
    let cursorY = cardTop + 82;

    const addField = (label: string, value: string, mono = false) => {
      doc.fillColor('#5A685E').font('Helvetica-Bold').fontSize(8.5).text(label.toUpperCase(), leftX + 24, cursorY);
      cursorY += 12;
      doc
        .fillColor('#111D15')
        .font(mono ? 'Courier-Bold' : 'Helvetica-Bold')
        .fontSize(11)
        .text(value, leftX + 24, cursorY, { width: detailsWidth });
      cursorY += 24;
    };

    addField('Patron Name', order.fullName);
    addField('Contact Phone', order.phone);
    if (order.email) {
      addField('Email', order.email);
    }
    addField(
      'Pass Selection',
      `${order.quantity} × ${order.tier.name} (${patronsAdmitted} ${patronsAdmitted === 1 ? 'patron' : 'patrons'} admitted)`
    );
    addField('Amount Paid', `${formatUgx(order.totalUgx)} (${paymentMethod})`, true);
    addField('Settlement Bank Ref', `${bankRef}  ·  ${formatReadableDate(order.credit?.valueDate)}`, true);

    // Right QR code panel
    const qrBoxX = leftX + contentWidth - 172;
    const qrBoxY = cardTop + 86;
    doc.roundedRect(qrBoxX, qrBoxY, 148, 178, 10).fillAndStroke('#FAF8F3', '#D5DDD7');
    doc.image(qrBuffer, qrBoxX + 14, qrBoxY + 12, { width: 120, height: 120 });
    doc.fillColor('#0E3B24').font('Helvetica-Bold').fontSize(9.5).text('GATE PASS QR', qrBoxX, qrBoxY + 140, {
      width: 148,
      align: 'center',
    });
    doc.fillColor('#5A685E').font('Helvetica').fontSize(8).text('Present at Entebbe Golf Club', qrBoxX + 8, qrBoxY + 155, {
      width: 132,
      align: 'center',
    });

    // Protea 50% hotel stay privilege card
    const hotelTop = cardTop + cardHeight + 18;
    doc.roundedRect(leftX, hotelTop, contentWidth, 82, 10).fill('#0E3B24');
    doc.fillColor('#E2CB7A').font('Helvetica-Bold').fontSize(9).text('50% STAY PRIVILEGE UNLOCKED', leftX + 24, hotelTop + 18);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(13).text(
      `${PROTEA_HOTEL_OFFER.partnerName} (Double Occupancy)`,
      leftX + 24,
      hotelTop + 34,
      { width: contentWidth - 200 }
    );
    doc.fillColor('#FAF8F3').font('Helvetica').fontSize(9).text(
      'Quote this voucher code when confirming your stay privilege.',
      leftX + 24,
      hotelTop + 53,
      { width: contentWidth - 200 }
    );

    const voucherBoxX = leftX + contentWidth - 172;
    doc.roundedRect(voucherBoxX, hotelTop + 20, 148, 42, 8).fillAndStroke('#174F32', '#C5A246');
    doc.fillColor('#E2CB7A').font('Courier-Bold').fontSize(11).text(
      order.hotelVoucherCode || 'INCLUDED',
      voucherBoxX,
      hotelTop + 35,
      { width: 148, align: 'center' }
    );

    // Formal welcome footer note
    const footerTop = hotelTop + 104;
    doc.fillColor('#0E3B24').font('Helvetica-Bold').fontSize(10).text(
      'Welcome to The Course — An Arrangement of Taste & Tone',
      leftX,
      footerTop,
      { width: contentWidth }
    );
    doc.fillColor('#36433A').font('Helvetica').fontSize(9.5).text(
      `Thank you for choosing to start the year's festival season with us. Present this PDF or your Gate Pass QR code upon arrival at Entebbe Golf Club on ${EVENT_INFO.dateLabel}.`,
      leftX,
      footerTop + 16,
      { width: contentWidth, lineGap: 3 }
    );
    doc.fillColor('#5A685E').font('Helvetica').fontSize(8.5).text(
      `Patron Desk: ${EVENT_INFO.phones.join(' · ')}  |  ${EVENT_INFO.email}  |  https://thecourse.autoshowkampala.com/`,
      leftX,
      footerTop + 56,
      { width: contentWidth }
    );

    doc.end();
  });
}

export async function sendTicketConfirmationEmail(order: OrderRecord): Promise<{
  sent: boolean;
  recipient?: string;
  error?: string;
}> {
  const recipient = (order.email || '').trim();
  if (!isSafeEmailAddress(recipient)) {
    return { sent: false, error: 'No valid patron email provided on this order.' };
  }

  const smtp = getSmtpConfig();
  if (!smtp) {
    return { sent: false, error: 'Hostinger SMTP credentials (SMTP_USER / SMTP_PASS) are not configured.' };
  }

  const pdfBuffer = await generateTicketPdfBuffer(order);
  const patronsAdmitted = order.tier.guestsIncluded * order.quantity;
  const passCode = order.passCode || order.orderId;
  const bankRef = order.credit?.bankRef || 'Verified';

  const textBody = [
    'Dear Sir/Madam,',
    '',
    "Thank you for choosing to start the year's festival season with us. We are delighted to welcome you to the hospitality of the event to meet fellow Patrons over an arrangement of taste & tone — The Course.",
    '',
    'Your payment has been verified and your Official Drive-in Patron Pass is attached to this email as a PDF.',
    '',
    'PASS SUMMARY',
    `Pass Code: ${passCode}`,
    `Order Reference: ${order.orderId}`,
    `Patron Name: ${order.fullName}`,
    `Pass Type: ${order.quantity} x ${order.tier.name} (${patronsAdmitted} ${patronsAdmitted === 1 ? 'patron' : 'patrons'} admitted)`,
    `Total Paid: ${formatUgx(order.totalUgx)}`,
    `Payment Bank Ref: ${bankRef}`,
    `Protea Hotel 50% Stay Voucher: ${order.hotelVoucherCode || 'Included'}`,
    `Date & Venue: ${EVENT_INFO.dateLabel} · ${EVENT_INFO.venue}`,
    '',
    'Please present the attached PDF pass (or the Gate Pass QR code inside it) at the entrance.',
    '',
    'Warm regards,',
    'The Course Patrons desk',
    'Your Host',
    `${EVENT_INFO.phones.join(' · ')} | ${EVENT_INFO.email}`,
    'https://thecourse.autoshowkampala.com/',
  ].join('\n');

  const htmlBody = `
  <div style="background-color:#FAF8F3;padding:28px 16px;font-family:Arial,Helvetica,sans-serif;color:#111D15;">
    <div style="max-width:600px;margin:0 auto;background-color:#FFFFFF;border:1px solid #D9E1DC;border-radius:14px;overflow:hidden;">
      <div style="background-color:#0E3B24;padding:24px 28px;color:#FFFFFF;">
        <p style="margin:0 0 6px 0;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#E2CB7A;font-weight:bold;">
          The Course · A Patrons' Gathering
        </p>
        <h1 style="margin:0;font-family:Georgia,serif;font-size:24px;line-height:1.25;color:#FFFFFF;">
          Your Drive-in Patron Pass is Ready
        </h1>
        <p style="margin:8px 0 0 0;font-size:13px;color:#FAF8F3;">
          ${escapeHtml(EVENT_INFO.dateLabel)} · ${escapeHtml(EVENT_INFO.venue)}
        </p>
      </div>

      <div style="padding:26px 28px;font-size:14px;line-height:1.65;color:#111D15;">
        <p style="margin:0 0 14px 0;">Dear Sir/Madam,</p>
        <p style="margin:0 0 14px 0;">
          Thank you for choosing to start the year's festival season with us. We are delighted to welcome you to the hospitality of the event to meet fellow Patrons over an arrangement of taste &amp; tone — <strong>The Course</strong>.
        </p>
        <p style="margin:0 0 20px 0;">
          Your payment has been confirmed and a PDF copy of your official ticket (including your Gate Pass QR code and Protea Hotel 50% stay voucher) is attached to this email.
        </p>

        <div style="background-color:#FAF8F3;border:1px solid #D9E1DC;border-radius:10px;padding:16px 18px;margin:0 0 20px 0;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <tr>
              <td style="padding:5px 0;color:#5A685E;">Pass Code</td>
              <td style="padding:5px 0;text-align:right;font-family:monospace;font-weight:bold;color:#0E3B24;">${escapeHtml(passCode)}</td>
            </tr>
            <tr>
              <td style="padding:5px 0;color:#5A685E;">Order Reference</td>
              <td style="padding:5px 0;text-align:right;font-family:monospace;font-weight:bold;">${escapeHtml(order.orderId)}</td>
            </tr>
            <tr>
              <td style="padding:5px 0;color:#5A685E;">Patron</td>
              <td style="padding:5px 0;text-align:right;font-weight:bold;">${escapeHtml(order.fullName)}</td>
            </tr>
            <tr>
              <td style="padding:5px 0;color:#5A685E;">Pass Type</td>
              <td style="padding:5px 0;text-align:right;">${order.quantity} &times; ${escapeHtml(order.tier.name)} (${patronsAdmitted} ${patronsAdmitted === 1 ? 'patron' : 'patrons'})</td>
            </tr>
            <tr>
              <td style="padding:5px 0;color:#5A685E;">Total Paid</td>
              <td style="padding:5px 0;text-align:right;font-family:monospace;font-weight:bold;color:#0E3B24;">${escapeHtml(formatUgx(order.totalUgx))}</td>
            </tr>
            <tr>
              <td style="padding:5px 0;color:#5A685E;">Settlement Bank Ref</td>
              <td style="padding:5px 0;text-align:right;font-family:monospace;">${escapeHtml(bankRef)}</td>
            </tr>
            <tr>
              <td style="padding:5px 0;color:#5A685E;">Protea 50% Stay Voucher</td>
              <td style="padding:5px 0;text-align:right;font-family:monospace;font-weight:bold;color:#0E3B24;">${escapeHtml(order.hotelVoucherCode || 'Included')}</td>
            </tr>
          </table>
        </div>

        <p style="margin:0 0 18px 0;font-size:13px;color:#36433A;">
          Please bring the attached PDF pass on your mobile device or printed copy for seamless gate check-in.
        </p>

        <p style="margin:0;">
          Warm regards,<br />
          <strong>The Course Patrons desk</strong><br />
          <span style="font-size:12px;color:#5A685E;">Your Host</span>
        </p>
      </div>

      <div style="background-color:#F3F0E7;padding:14px 28px;border-top:1px solid #D9E1DC;font-size:12px;color:#5A685E;">
        ${escapeHtml(EVENT_INFO.phones.join(' · '))} &nbsp;|&nbsp; ${escapeHtml(EVENT_INFO.email)} &nbsp;|&nbsp; https://thecourse.autoshowkampala.com/
      </div>
    </div>
  </div>`;

  const transporter = getTransporter(smtp);
  await transporter.sendMail({
    from: smtp.from,
    to: recipient,
    replyTo: smtp.user,
    subject: `Your Official Drive-in Pass — The Course 2026 (${passCode})`,
    text: textBody,
    html: htmlBody,
    attachments: [
      {
        filename: `the-course-pass-${order.orderId}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });

  return { sent: true, recipient };
}
