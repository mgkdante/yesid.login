import tokens from '@yesid/tokens/tokens.json';

interface Token {
  $value?: string;
  value?: string;
}

const palette = tokens.color as unknown as Record<'dark' | 'light' | 'brand', Record<string, Token>>;
const colour = (token: Token) => (token.$value ?? token.value) as string;

export type EmailTheme = 'light' | 'dark';
export const emailTheme = (value: unknown): EmailTheme => value === 'light' ? 'light' : 'dark';
const colours = (theme: EmailTheme) => ({
  background: colour(palette[theme].background), foreground: colour(palette[theme].foreground),
  card: colour(palette[theme].card), muted: colour(palette[theme]['muted-foreground']),
  border: colour(palette[theme]['border-subtle']), accent: colour(palette[theme]['accent-text'])
});
const dark = colours('dark');
const hazard = { yellow: colour(palette.brand.accent), black: colour(palette.brand['hazard-b']) };

// Mail apps do not load the site's fonts or stylesheets, so everything is inline with safe fallbacks.
const SANS = "Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace";

export interface Email {
  subject: string;
  html: string;
  text: string;
}

export type EmailLanguage = 'fr' | 'en' | 'es';
export const emailLanguage = (value: unknown): EmailLanguage => value === 'en' || value === 'es' ? value : 'fr';
const words = {
  fr: { subject: 'Votre code de connexion :', title: 'Votre code de connexion', editor: 'Éditeur du site', intro: 'Votre code de connexion est', note: 'Il expire dans 5 minutes. Si vous n’avez rien demandé, ignorez ce message.' },
  en: { subject: 'Your sign-in code:', title: 'Your sign-in code', editor: 'Site editor', intro: 'Your sign-in code is', note: 'It expires in 5 minutes. If you did not request it, ignore this message.' },
  es: { subject: 'Tu código de inicio de sesión:', title: 'Tu código de inicio de sesión', editor: 'Editor del sitio', intro: 'Tu código de inicio de sesión es', note: 'Vence en 5 minutos. Si no lo solicitaste, ignora este mensaje.' }
};

/** The passcode email in the yesid.dev design, with a plain text version for every mail app. */
export function passcodeEmail(code: string, language: EmailLanguage = 'fr', theme: EmailTheme = 'dark'): Email {
  if (!/^\d{6}$/.test(code)) throw new Error('A passcode must be six digits');

  const dark = colours(emailTheme(theme));
  const text = words[emailLanguage(language)];
  return {
    subject: `${text.subject} ${code}`,
    text: `${text.intro} ${code}.\n\n${text.note}\n\nlogin.yesid.dev\n`,
    html: emailShell(text.title, `<p class="code" style="font-family:${MONO};font-size:32px;font-weight:700;letter-spacing:9px;background-color:${dark.card};border:1px solid ${dark.border};border-radius:8px;padding:22px 12px;text-align:center;">${code}</p><p>${text.note}</p>`, language, theme)
  };
}

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
export function welcomeEmail(label: string, slug: string, language: EmailLanguage): Email {
  const words = {
    fr: ['Accès à l’éditeur de', 'Vous avez maintenant accès à l’éditeur de', 'Ouvrir l’éditeur'],
    en: ['Access to the editor for', 'You now have access to the editor for', 'Open the editor'],
    es: ['Acceso al editor de', 'Ya tienes acceso al editor de', 'Abrir el editor']
  }[language];
  const url = `https://login.yesid.dev/${encodeURIComponent(slug)}/`;
  const note = { fr: 'Connectez-vous dans les 7 jours. Ignorez ce message si vous ne l’attendiez pas.', en: 'Sign in within 7 days. Ignore this message if you were not expecting it.', es: 'Inicia sesión dentro de 7 días. Ignora este mensaje si no lo esperabas.' }[language];
  return adaptive({ subject: `${words[0]} ${label}`, text: `${words[1]} ${label}.\n${note}\n${url}\n`,
    html: emailShell(words[0], `<p>${words[1]} ${escapeHtml(label)}.</p><p>${note}</p><a href="${url}">${words[2]}</a>`, language) });
}

export function emailChangedEmail(language: EmailLanguage): Email {
  const [subject, note] = {
    fr: ['Courriel modifié', 'Le courriel de votre compte a été modifié. Si vous n’avez pas demandé ce changement, contactez la personne responsable de votre site.'],
    en: ['Email changed', 'Your account email has changed. If you did not request this change, contact the person responsible for your site.'],
    es: ['Correo modificado', 'El correo de tu cuenta ha cambiado. Si no solicitaste este cambio, contacta a la persona responsable de tu sitio.']
  }[language];
  return adaptive({ subject, text: `${note}\n\nlogin.yesid.dev`, html: emailShell(subject, `<p>${note}</p>`, language) });
}

/** Inline light defaults for older mail apps, dark overrides for supporting readers. */
function adaptive(email: Email): Email {
  const style = `<meta name="color-scheme" content="light dark"><style>@media(prefers-color-scheme:dark){.mail-ground{background-color:${dark.background}!important}.mail-copy{color:${dark.foreground}!important}.mail-accent,a{color:${dark.accent}!important}}</style>`;
  // The first color-scheme tag wins, so the shell's fixed one has to go for the override to apply.
  email.html = email.html.replace(/<meta name="color-scheme"[^>]*><meta name="supported-color-schemes"[^>]*>/, '').replace('</head>', `${style}</head>`);
  return email;
}
export function ownerNoticeEmail(email: string, label: string, slug: string): Email {
  const url = `https://login.yesid.dev/${encodeURIComponent(slug)}/people`;
  // A sign-in confirms the address for every invitation it has, so this says what it proves, not that they visited this site.
  const note = `${email} a confirmé son adresse et peut maintenant modifier ${label}. Si vous ne reconnaissez pas cette adresse, retirez-la sur la page Personnes.`;
  return adaptive({ subject: 'Nouvelle personne sur votre site', text: `${note}\n${url}`,
    html: emailShell('Nouvelle personne', `<p>${escapeHtml(note)}</p><a href="${url}">Gérer les personnes</a>`, 'fr') });
}

function emailShell(title: string, body: string, language: EmailLanguage, theme: EmailTheme = 'light'): string {
  const c = colours(theme);
  const content = body.replaceAll('<p>', `<p class="mail-copy" style="font-size:16px;line-height:1.6;color:${c.foreground};">`).replaceAll('<a ', `<a class="mail-accent" style="color:${c.accent};" `);
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="${theme}"><meta name="supported-color-schemes" content="${theme}"><title>${escapeHtml(title)}</title></head>
<body class="mail-ground" style="margin:0;padding:0;background-color:${c.background};">
<table class="mail-ground" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${c.background}" style="background-color:${c.background};">
<tr><td height="8" bgcolor="${hazard.yellow}" style="background-image:repeating-linear-gradient(-45deg,${hazard.yellow} 0 12px,${hazard.black} 12px 24px);font-size:0;">&nbsp;</td></tr>
<tr><td align="center" style="padding:40px 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;"><tr><td class="mail-copy" style="font-family:${SANS};color:${c.foreground};">
<p class="mail-accent" style="font-family:${MONO};font-size:13px;color:${c.accent};">yesid. | login</p>
<h1 class="mail-copy" style="font-size:28px;line-height:1.2;color:${c.foreground};">${escapeHtml(title)}</h1>${content}
<p class="mail-copy" style="padding-top:32px;font-family:${MONO};font-size:13px;color:${c.muted};">login.yesid.dev</p>
</td></tr></table></td></tr></table></body></html>`;
}
