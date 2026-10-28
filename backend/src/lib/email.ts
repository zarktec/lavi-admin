import { envOpt } from "./env";

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Correo transaccional (Resend o Postmark). Sin credenciales, se imprime en consola (desarrollo). */
export async function sendMail(mail: Mail): Promise<void> {
  const key = envOpt("EMAIL_API_KEY");
  const from = envOpt("EMAIL_FROM", "no-reply@example.com");
  if (!key) {
    console.log(`[correo:dev] Para: ${mail.to}\nAsunto: ${mail.subject}\n${mail.text}`);
    return;
  }
  const provider = envOpt("EMAIL_PROVIDER", "resend");
  const res =
    provider === "postmark"
      ? await fetch("https://api.postmarkapp.com/email", {
          method: "POST",
          headers: { "X-Postmark-Server-Token": key, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ From: from, To: mail.to, Subject: mail.subject, HtmlBody: mail.html, TextBody: mail.text }),
        })
      : await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text }),
        });
  if (!res.ok) throw new Error(`Error enviando correo (${provider}): ${res.status} ${await res.text()}`);
}

export const inviteMail = (to: string, name: string | null, link: string, hours: number): Mail => ({
  to,
  subject: "Te invitaron al panel administrativo",
  text: `Hola${name ? " " + name : ""}, te invitaron al panel. Crea tu contraseña y configura la verificación en dos pasos aquí (vence en ${hours} h): ${link}`,
  html: `<p>Hola${name ? " " + name : ""},</p><p>Te invitaron al panel administrativo. Crea tu contraseña y configura la verificación en dos pasos (el enlace vence en ${hours} h):</p><p><a href="${link}">${link}</a></p>`,
});

export const resetMail = (to: string, link: string): Mail => ({
  to,
  subject: "Recuperación de acceso al panel",
  text: `Para definir una nueva contraseña entra aquí (vence en 1 hora): ${link}. Si no lo pediste, ignora este correo.`,
  html: `<p>Para definir una nueva contraseña entra aquí (el enlace vence en 1 hora):</p><p><a href="${link}">${link}</a></p><p>Si no lo pediste, ignora este correo.</p>`,
});
