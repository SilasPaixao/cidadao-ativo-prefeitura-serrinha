import axios from "axios";

export class EmailService {
  private apiKey: string;
  private senderName: string;
  private senderEmail: string;

  constructor() {
    this.apiKey = process.env.BREVO_API_KEY || "";
    this.senderName = process.env.BREVO_SENDER_NAME || "Prefeitura";
    this.senderEmail = process.env.BREVO_SENDER_EMAIL || "silas.paixao873@gmail.com";
  }

  async sendPasswordResetEmail(toEmail: string, userName: string, resetUrl: string) {
    if (!this.apiKey) {
      console.warn("⚠️ BREVO_API_KEY não configurada. E-mail de recuperação não enviado.");
      return;
    }

    const data = {
      sender: {
        name: this.senderName,
        email: this.senderEmail,
      },
      to: [
        {
          email: toEmail,
          name: userName,
        },
      ],
      subject: "Recuperação de Senha - Prefeitura de Serrinha",
      htmlContent: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #1f2937;">Recuperação de Senha</h2>
          <p>Olá <strong>${userName}</strong>,</p>
          <p>Recebemos uma solicitação para redefinir sua senha na plataforma <strong>Prefeitura de Serrinha - Cidadão ativo!</strong>.</p>
          <p>Para prosseguir com a redefinição, clique no botão abaixo:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Redefinir Minha Senha</a>
          </div>
          <p style="color: #4b5563; font-size: 14px;">Este link expirará em 1 hora. Se você não solicitou esta alteração, ignore este e-mail.</p>
          <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">Prefeitura de Serrinha - Cidadão ativo!</p>
        </div>
      `,
    };

    try {
      const response = await axios.post("https://api.brevo.com/v3/smtp/email", data, {
        headers: {
          "api-key": this.apiKey,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
      });
      console.log(`✅ E-mail de recuperação enviado para ${toEmail} via Brevo. ID: ${response.data.messageId}`);
      return response.data;
    } catch (error: any) {
      console.error("❌ Erro ao enviar e-mail via Brevo:", error.response?.data || error.message);
      throw new Error("Falha ao enviar e-mail de recuperação.");
    }
  }
}
