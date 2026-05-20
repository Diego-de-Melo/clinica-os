export const APP_NAME = "ClinicaOS";

export const WHATSAPP_SUPPORT_NUMBER = "55REMOVIDO";

export function buildWhatsAppActivationLink(email: string) {
  const msg = `Olá, preciso ativar minha conta. Meu email é: ${email}`;
  return `https://wa.me/${WHATSAPP_SUPPORT_NUMBER}?text=${encodeURIComponent(msg)}`;
}
