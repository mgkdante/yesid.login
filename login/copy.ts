export const locales = ['fr', 'en', 'es'] as const;
export type Locale = typeof locales[number];
export const language = (value: unknown): Locale | undefined =>
  value === 'fr' || value === 'en' || value === 'es' ? value : undefined;

const fr = {
  switchSite: 'Me déconnecter de ce site pour changer de site', switchNotice: 'Pour ouvrir un autre site, déconnectez-vous de ce site, puis reconnectez-vous avec un code.',
  step1: 'Étape 1 sur 2', step2: 'Étape 2 sur 2', codeTitle: 'Entrez votre code', codeLead: "Si {email} a accès à un site, un code vient d'y être envoyé. Il expire dans 5 minutes. Vérifiez aussi vos courriels indésirables.", resend: 'Renvoyer le code', change: 'Changer de courriel', resent: 'Demande envoyée. Vérifiez votre courriel.', noRestore: 'Votre navigateur ne permet pas de conserver cette étape après un changement de langue.', skip: 'Aller au contenu', account: 'Changer mon courriel',
  title: 'Connectez-vous pour modifier votre site', eyebrow: 'Éditeur du site',
  lead: 'Entrez votre courriel. Nous vous enverrons un code à 6 chiffres, puis nous vous mènerons à votre site. Aucun mot de passe.',
  email: 'Courriel', code: 'Code reçu', send: 'Recevoir mon code', verify: 'Me connecter',
  theme: 'Thème sombre', language: 'Langue', brand: 'yesid.dev, nouvel onglet',
  footerTagline: '// connexion à l’éditeur de site', footerProduct: 'Login', footerSignIn: 'Se connecter', footerSite: 'Site web', footerContact: 'Contact', footerStatus: 'SYSTÈME', footerLive: 'En direct',
  neutral: 'Si ce courriel a accès, un code vient d’être envoyé.',
  rate: 'Trop de demandes. Réessayez dans quelques minutes.',
  sendError: 'Envoi impossible. Réessayez.', invalid: 'Code invalide ou expiré.',
  connection: 'Connexion impossible. Réessayez.', unavailable: 'Connexion indisponible. Réessayez.',
  sitesError: 'Sites indisponibles. Réessayez.', choose: 'Choisissez votre site.',
  empty: 'Aucun site associé à votre compte.', connected: 'Connecté.',
  reopen: 'Rouvrez cette page depuis l’éditeur.', scripting: 'Activez JavaScript pour vous connecter.'
};
type Copy = Record<keyof typeof fr, string>;
export const copy: Record<Locale, Copy> = {
  fr,
  en: {
    switchSite: 'Sign out of this site to switch sites', switchNotice: 'To open another site, sign out of this site, then sign in again with a code.',
    step1: 'Step 1 of 2', step2: 'Step 2 of 2', codeTitle: 'Enter your code', codeLead: 'If {email} has access to a site, a code has just been sent there. It expires in 5 minutes. Check your junk mail too.', resend: 'Resend code', change: 'Change email', resent: 'Request sent. Check your email.', noRestore: 'Your browser cannot keep this step when you change language.', skip: 'Skip to content', account: 'Change my email',
    title: 'Sign in to edit your website', eyebrow: 'Site editor', lead: 'Enter your email. We will send you a 6-digit code, then take you to your site. No password.',
    email: 'Email', code: 'Your code', send: 'Send a code', verify: 'Sign in',
    theme: 'Dark theme', language: 'Language', brand: 'yesid.dev, new tab',
    footerTagline: '// site editor sign-in', footerProduct: 'Login', footerSignIn: 'Sign in', footerSite: 'Website', footerContact: 'Contact', footerStatus: 'SYSTEM', footerLive: 'Live',
    neutral: 'If this email has access, a code has just been sent.',
    rate: 'Too many requests. Try again in a few minutes.',
    sendError: 'Could not send. Try again.', invalid: 'Invalid or expired code.',
    connection: 'Could not sign in. Try again.', unavailable: 'Sign-in unavailable. Try again.',
    sitesError: 'Sites unavailable. Try again.', choose: 'Choose your site.',
    empty: 'No site is linked to your account.', connected: 'Signed in.',
    reopen: 'Reopen this page from the editor.', scripting: 'Enable JavaScript to sign in.'
  },
  es: {
    switchSite: 'Cerrar sesión en este sitio para cambiar de sitio', switchNotice: 'Para abrir otro sitio, cierra sesión en este sitio e inicia sesión de nuevo con un código.',
    step1: 'Paso 1 de 2', step2: 'Paso 2 de 2', codeTitle: 'Ingresa tu código', codeLead: 'Si {email} tiene acceso a un sitio, acabamos de enviarle un código. Vence en 5 minutos. Revisa también tu correo no deseado.', resend: 'Reenviar el código', change: 'Cambiar de correo', resent: 'Solicitud enviada. Revisa tu correo.', noRestore: 'Tu navegador no permite conservar este paso al cambiar de idioma.', skip: 'Ir al contenido', account: 'Cambiar mi correo',
    title: 'Inicia sesión para editar tu sitio', eyebrow: 'Editor del sitio', lead: 'Ingresa tu correo. Te enviaremos un código de 6 dígitos y te llevaremos a tu sitio. Sin contraseña.',
    email: 'Correo electrónico', code: 'Código recibido', send: 'Recibir un código', verify: 'Iniciar sesión',
    theme: 'Tema oscuro', language: 'Idioma', brand: 'yesid.dev, pestaña nueva',
    footerTagline: '// acceso al editor del sitio', footerProduct: 'Login', footerSignIn: 'Iniciar sesión', footerSite: 'Sitio web', footerContact: 'Contacto', footerStatus: 'SISTEMA', footerLive: 'En vivo',
    neutral: 'Si este correo tiene acceso, se acaba de enviar un código.',
    rate: 'Demasiadas solicitudes. Inténtalo en unos minutos.',
    sendError: 'No se pudo enviar. Inténtalo de nuevo.', invalid: 'Código inválido o vencido.',
    connection: 'No se pudo iniciar sesión. Inténtalo de nuevo.', unavailable: 'Inicio de sesión no disponible. Inténtalo de nuevo.',
    sitesError: 'Sitios no disponibles. Inténtalo de nuevo.', choose: 'Elige tu sitio.',
    empty: 'No hay sitios asociados a tu cuenta.', connected: 'Sesión iniciada.',
    reopen: 'Abre esta página desde el editor.', scripting: 'Activa JavaScript para iniciar sesión.'
  }
};
export type Message = keyof typeof fr;

export const peopleCopy = {
  fr: { loadFailed: 'Impossible de charger les personnes ayant accès. Réessayez.', roleHelp: 'Les propriétaires et les TI gèrent les accès. Les employés modifient le contenu.', singular: 'personne', plural: 'personnes', never: 'Aucune modification enregistrée', unchanged: 'Cette personne a déjà accès au site.', added: 'Accès ajouté. L’envoi d’un courriel d’invitation a été demandé.', renewed: 'Invitation renouvelée. L’envoi d’un courriel d’invitation a été demandé.', renewedMail: 'Invitation renouvelée, mais le courriel d’invitation n’a pas pu être envoyé. Partagez ce lien vers l’éditeur :', title: 'Personnes', back: 'Retour à l’éditeur', add: 'Ajouter un employé', remove: 'Retirer', confirm: 'Retirer cet accès ?', cancel: 'Annuler', done: 'Accès retiré.', failed: 'Impossible d’effectuer ce changement. Réessayez.', forbidden: 'Vous ne pouvez pas gérer les accès à ce site. Adressez-vous au propriétaire.', full: 'Ce site a déjà 25 personnes.', rate: 'Trop d’ajouts. Réessayez dans une heure.', mail: 'Accès ajouté, mais le courriel d’invitation n’a pas pu être envoyé. Partagez ce lien vers l’éditeur :', owner: 'Propriétaire', employee: 'Employé', it: 'IT', loading: 'Chargement…' },
  en: { loadFailed: 'We could not load people with access. Try again.', roleHelp: 'Owners and IT manage access. Employees edit content.', singular: 'person', plural: 'people', never: 'No edit on record', unchanged: 'This person already has access.', added: 'Access added. An invitation email was requested.', renewed: 'Invitation renewed. An invitation email was requested.', renewedMail: 'Invitation renewed, but the invitation email could not be sent. Share this editor link:', title: 'People', back: 'Back to the editor', add: 'Add an Employee', remove: 'Remove', confirm: 'Remove this access?', cancel: 'Cancel', done: 'Access removed.', failed: 'We could not complete this change. Try again.', forbidden: 'You cannot manage access to this site. Ask the site owner.', full: 'This site already has 25 people.', rate: 'Too many additions. Try again in an hour.', mail: 'Access added, but the invitation email could not be sent. Share this editor link:', owner: 'Owner', employee: 'Employee', it: 'IT', loading: 'Loading…' },
  es: { loadFailed: 'No pudimos cargar las personas con acceso. Inténtalo de nuevo.', roleHelp: 'Los propietarios y TI gestionan el acceso. Los empleados editan el contenido.', singular: 'persona', plural: 'personas', never: 'Sin ediciones registradas', unchanged: 'Esta persona ya tiene acceso al sitio.', added: 'Se agregó el acceso. Se solicitó el envío de una invitación por correo.', renewed: 'Invitación renovada. Se solicitó el envío de una invitación por correo.', renewedMail: 'Invitación renovada, pero no se pudo enviar la invitación. Comparte este enlace al editor:', title: 'Personas', back: 'Volver al editor', add: 'Añadir un empleado', remove: 'Quitar', confirm: '¿Quitar este acceso?', cancel: 'Cancelar', done: 'Acceso eliminado.', failed: 'No pudimos completar este cambio. Inténtalo de nuevo.', forbidden: 'No puedes gestionar el acceso a este sitio. Consulta al propietario.', full: 'Este sitio ya tiene 25 personas.', rate: 'Demasiadas adiciones. Inténtalo en una hora.', mail: 'Se agregó el acceso, pero no se pudo enviar la invitación. Comparte este enlace al editor:', owner: 'Propietario', employee: 'Empleado', it: 'IT', loading: 'Cargando…' }
};
