export const locales = ['fr', 'en', 'es'] as const;
export type Locale = typeof locales[number];
export const language = (value: unknown): Locale | undefined =>
  value === 'fr' || value === 'en' || value === 'es' ? value : undefined;

const fr = {
  switchSite: 'Me déconnecter et continuer', switchWebsites: 'Changer de site', switchNotice: 'Pour changer de site, déconnectez-vous et reconnectez-vous avec un nouveau code.',
  step1: 'Étape 1 sur 2', step2: 'Étape 2 sur 2', codeTitle: 'Entrez le code reçu par courriel', codeLead: 'Si {email} a accès à un site, un code y a été envoyé. Il est valide pendant 5 minutes.', resend: 'Demander un autre code', change: 'Changer d’adresse courriel', resent: 'Demande reçue. Vérifiez votre boîte de réception et vos courriels indésirables. Utilisez le dernier code.', noRestore: 'Ce navigateur ne peut pas conserver cette étape si vous changez de langue. Vous devrez peut-être demander un autre code.', skip: 'Aller au contenu', account: 'Changer mon courriel',
  title: 'Connectez-vous pour modifier votre site', eyebrow: 'Éditeur du site',
  lead: 'Utilisez l’adresse courriel qui a accès à votre site. Connectez-vous avec un code, sans mot de passe.',
  email: 'Adresse courriel', code: 'Code à 6 chiffres', send: 'M’envoyer un code', verify: 'Me connecter',
  theme: 'Thème sombre', language: 'Langue', brand: 'yesid.dev, nouvel onglet',
  footerTagline: 'connexion à l’éditeur de site', footerProduct: 'Login', footerSignIn: 'Se connecter', footerSite: 'Site web', footerContact: 'Contact',
  neutral: 'Si ce courriel a accès, un code vient d’être envoyé.',
  rate: 'Trop de demandes. Réessayez plus tard.',
  checkError: 'Impossible de traiter la demande. Réessayez.', sendError: 'Impossible de traiter la demande. Réessayez.', invalid: 'Ce code n’a pas fonctionné. Vérifiez le dernier courriel ou demandez un autre code.',
  connection: 'Connexion impossible. Réessayez.', unavailable: 'Connexion indisponible. Réessayez.',
  sitesError: 'Impossible de charger vos sites. Réessayez.', choose: 'Choisissez un site',
  empty: 'Aucun site n’est lié à ce compte. Demandez au propriétaire de vérifier votre accès.', connected: 'Connexion confirmée. Revenez à la fenêtre de votre éditeur pour continuer.',
  reopen: 'Ouvrez la connexion depuis votre éditeur, puis réessayez.', scripting: 'Activez JavaScript pour vous connecter.',
  requesting: 'Demande de code en cours…',
  checking: 'Vérification du code…',
  format: 'Entrez le code à 6 chiffres reçu par courriel. Vous pouvez le coller.',
  expired: 'Cette demande de code a expiré. Demandez un autre code pour continuer.',
  rateOne: 'Trop de demandes. Réessayez dans {n} minute.', rateMany: 'Trop de demandes. Réessayez dans {n} minutes.',
  openEditor: 'Ouvrir l’éditeur',
  keepEditing: 'Continuer à modifier le site',
  signOut: 'Me déconnecter',
  retry: 'Réessayer',
  loadingSites: 'Chargement de vos sites…',
  openingEditor: 'Ouverture de l’éditeur…',
  openingSite: 'Ouverture de l’éditeur de {site}…',
  openFailure: 'Impossible d’ouvrir cet éditeur. Réessayez.',
  sessionEnded: 'Votre connexion a pris fin. Connectez-vous de nouveau.',
  handoverFailed: 'Impossible de joindre la fenêtre de votre éditeur.',
  editorStorage: 'Ce navigateur bloque le stockage nécessaire à l’éditeur. Autorisez les données du site pour login.yesid.dev, puis réessayez.',
};
type Copy = Record<keyof typeof fr, string>;
export const copy: Record<Locale, Copy> = {
  fr,
  en: {
    switchSite: 'Sign out and continue', switchWebsites: 'Switch websites', switchNotice: 'To switch websites, sign out and sign in again with a new code.',
    step1: 'Step 1 of 2', step2: 'Step 2 of 2', codeTitle: 'Enter the code from your email', codeLead: 'If {email} has access to a site, a code has been sent there. It is valid for 5 minutes.', resend: 'Request another code', change: 'Change email address', resent: 'Request received. Check your inbox and junk mail. Use the latest code.', noRestore: 'This browser cannot keep this sign-in step when you change language. You may need to request another code.', skip: 'Skip to content', account: 'Change my email',
    title: 'Sign in to edit your website', eyebrow: 'Site editor', lead: 'Use the email address that has access to your site. Sign in with a code, without a password.',
    email: 'Email address', code: '6-digit code', send: 'Send me a code', verify: 'Sign in',
    theme: 'Dark theme', language: 'Language', brand: 'yesid.dev, new tab',
    footerTagline: 'site editor sign-in', footerProduct: 'Login', footerSignIn: 'Sign in', footerSite: 'Website', footerContact: 'Contact',
    neutral: 'If this email has access, a code has just been sent.',
    rate: 'Too many requests. Try again later.',
    checkError: 'We could not process the request. Try again.', sendError: 'We could not process the request. Try again.', invalid: 'That code did not work. Check the latest email, or request another code.',
    connection: 'Could not sign in. Try again.', unavailable: 'Sign-in unavailable. Try again.',
    sitesError: 'We could not load your websites. Try again.', choose: 'Choose a website',
    empty: 'No website is linked to this account. Ask the site owner to check your access.', connected: 'Sign-in confirmed. Return to your editor window to continue.',
    reopen: 'Open sign-in from your editor, then try again.', scripting: 'Enable JavaScript to sign in.',
    requesting: 'Requesting a code…',
    checking: 'Checking code…',
    format: 'Enter the 6-digit code from the email. You can paste it.',
    expired: 'This code request has expired. Request another code to continue.',
    rateOne: 'Too many requests. Try again in {n} minute.', rateMany: 'Too many requests. Try again in {n} minutes.',
  openEditor: 'Open editor',
  keepEditing: 'Keep editing',
  signOut: 'Sign out',
  retry: 'Try again',
  loadingSites: 'Loading your websites…',
  openingEditor: 'Opening the editor…',
  openingSite: 'Opening the editor for {site}…',
  openFailure: 'We could not open this editor. Try again.',
  sessionEnded: 'Your sign-in has ended. Sign in again.',
  handoverFailed: 'We could not reach your editor window.',
  editorStorage: 'This browser is blocking the storage the editor needs. Allow site data for login.yesid.dev, then try again.',
  },
  es: {
    switchSite: 'Cerrar sesión y continuar', switchWebsites: 'Cambiar de sitio', switchNotice: 'Para cambiar de sitio, cierra sesión e inicia sesión de nuevo con un código nuevo.',
    step1: 'Paso 1 de 2', step2: 'Paso 2 de 2', codeTitle: 'Escribe el código de tu correo', codeLead: 'Si {email} tiene acceso a un sitio, se ha enviado un código a esa dirección. Es válido durante 5 minutos.', resend: 'Pedir otro código', change: 'Cambiar el correo', resent: 'Solicitud recibida. Revisa tu bandeja de entrada y el correo no deseado. Usa el código más reciente.', noRestore: 'Este navegador no puede conservar este paso si cambias de idioma. Puede que tengas que pedir otro código.', skip: 'Ir al contenido', account: 'Cambiar mi correo',
    title: 'Inicia sesión para editar tu sitio', eyebrow: 'Editor del sitio', lead: 'Usa el correo que tiene acceso a tu sitio. Inicia sesión con un código, sin contraseña.',
    email: 'Correo electrónico', code: 'Código de 6 dígitos', send: 'Enviarme un código', verify: 'Iniciar sesión',
    theme: 'Tema oscuro', language: 'Idioma', brand: 'yesid.dev, pestaña nueva',
    footerTagline: 'acceso al editor del sitio', footerProduct: 'Login', footerSignIn: 'Iniciar sesión', footerSite: 'Sitio web', footerContact: 'Contacto',
    neutral: 'Si este correo tiene acceso, se acaba de enviar un código.',
    rate: 'Demasiadas solicitudes. Inténtalo más tarde.',
    checkError: 'No pudimos procesar la solicitud. Inténtalo de nuevo.', sendError: 'No pudimos procesar la solicitud. Inténtalo de nuevo.', invalid: 'Ese código no funcionó. Revisa el correo más reciente o pide otro código.',
    connection: 'No se pudo iniciar sesión. Inténtalo de nuevo.', unavailable: 'Inicio de sesión no disponible. Inténtalo de nuevo.',
    sitesError: 'No pudimos cargar tus sitios. Inténtalo de nuevo.', choose: 'Elige un sitio',
    empty: 'No hay ningún sitio vinculado a esta cuenta. Pide al propietario que revise tu acceso.', connected: 'Inicio de sesión confirmado. Vuelve a la ventana del editor para continuar.',
    reopen: 'Abre el inicio de sesión desde el editor e inténtalo de nuevo.', scripting: 'Activa JavaScript para iniciar sesión.',
    requesting: 'Solicitando un código…',
    checking: 'Verificando el código…',
    format: 'Escribe el código de 6 dígitos del correo. Puedes pegarlo.',
    expired: 'Esta solicitud de código venció. Pide otro código para continuar.',
    rateOne: 'Demasiadas solicitudes. Inténtalo en {n} minuto.', rateMany: 'Demasiadas solicitudes. Inténtalo en {n} minutos.',
  openEditor: 'Abrir el editor',
  keepEditing: 'Seguir editando',
  signOut: 'Cerrar sesión',
  retry: 'Intentar de nuevo',
  loadingSites: 'Cargando tus sitios…',
  openingEditor: 'Abriendo el editor…',
  openingSite: 'Abriendo el editor de {site}…',
  openFailure: 'No pudimos abrir este editor. Inténtalo de nuevo.',
  sessionEnded: 'Tu sesión ha terminado. Inicia sesión de nuevo.',
  handoverFailed: 'No pudimos contactar con la ventana de tu editor.',
  editorStorage: 'Este navegador bloquea el almacenamiento que necesita el editor. Permite los datos del sitio para login.yesid.dev e inténtalo de nuevo.',
  }
};
export type Message = keyof typeof fr;

export const peopleCopy = {
  fr: { loadFailed: 'Impossible de charger les personnes ayant accès. Réessayez.', roleHelp: 'Les propriétaires et les membres IT gèrent les accès. Les employés modifient le contenu.', singular: 'personne', plural: 'personnes', never: 'Aucune modification enregistrée', pendingInvitation: 'Une invitation est déjà en attente pour cette adresse.', unchanged: 'Cette personne a déjà accès au site.', added: 'Accès ajouté. L’envoi d’un courriel d’invitation a été demandé.', renewed: 'Invitation renouvelée. L’envoi d’un courriel d’invitation a été demandé.', renewedMail: 'Invitation renouvelée, mais le courriel d’invitation n’a pas pu être envoyé. Partagez ce lien vers l’éditeur :', title: 'Personnes', back: 'Retour à l’éditeur', add: 'Ajouter un employé', remove: 'Retirer', confirm: 'Retirer cet accès ?', cancel: 'Annuler', done: 'Accès retiré.', failed: 'Impossible d’effectuer ce changement. Réessayez.', forbidden: 'Vous ne pouvez pas gérer les accès à ce site. Adressez-vous au propriétaire.', full: 'Ce site compte déjà 25 personnes. Retirez une personne avant d’en ajouter une autre.', rate: 'Trop d’invitations. Réessayez plus tard.', mail: 'Accès ajouté, mais le courriel d’invitation n’a pas pu être envoyé. Partagez ce lien vers l’éditeur :', owner: 'Propriétaire', employee: 'Employé', it: 'IT', loading: 'Chargement…' },
  en: { loadFailed: 'We could not load people with access. Try again.', roleHelp: 'Owners and IT manage access. Employees edit content.', singular: 'person', plural: 'people', never: 'No edit on record', pendingInvitation: 'An invitation is already pending for this address.', unchanged: 'This person already has access.', added: 'Access added. An invitation email was requested.', renewed: 'Invitation renewed. An invitation email was requested.', renewedMail: 'Invitation renewed, but the invitation email could not be sent. Share this editor link:', title: 'People', back: 'Back to the editor', add: 'Add an Employee', remove: 'Remove', confirm: 'Remove this access?', cancel: 'Cancel', done: 'Access removed.', failed: 'We could not complete this change. Try again.', forbidden: 'You cannot manage access to this site. Ask the site owner.', full: 'This site already has 25 people. Remove someone before adding another person.', rate: 'Too many invitations. Try again later.', mail: 'Access added, but the invitation email could not be sent. Share this editor link:', owner: 'Owner', employee: 'Employee', it: 'IT', loading: 'Loading…' },
  es: { loadFailed: 'No pudimos cargar las personas con acceso. Inténtalo de nuevo.', roleHelp: 'Los propietarios y TI gestionan el acceso. Los empleados editan el contenido.', singular: 'persona', plural: 'personas', never: 'Sin ediciones registradas', pendingInvitation: 'Ya hay una invitación pendiente para esta dirección.', unchanged: 'Esta persona ya tiene acceso al sitio.', added: 'Se agregó el acceso. Se solicitó el envío de una invitación por correo.', renewed: 'Invitación renovada. Se solicitó el envío de una invitación por correo.', renewedMail: 'Invitación renovada, pero no se pudo enviar la invitación. Comparte este enlace al editor:', title: 'Personas', back: 'Volver al editor', add: 'Agregar a una persona', remove: 'Quitar el acceso', confirm: '¿Quitar este acceso?', cancel: 'Cancelar', done: 'Se quitó el acceso.', failed: 'No pudimos completar este cambio. Inténtalo de nuevo.', forbidden: 'No puedes gestionar el acceso a este sitio. Consulta al propietario.', full: 'Este sitio ya tiene 25 personas. Quita a una antes de agregar a otra.', rate: 'Demasiadas invitaciones. Inténtalo más tarde.', mail: 'Se agregó el acceso, pero no se pudo enviar la invitación. Comparte este enlace al editor:', owner: 'Propietario', employee: 'Empleado', it: 'IT', loading: 'Cargando…' }
};

export const accountCopy = {
    fr: { loadFailed: 'Impossible de charger votre compte. Réessayez.', retry: 'Réessayer', sendFailed: 'Impossible d’envoyer un code à votre adresse actuelle. Réessayez.', checkFailed: 'Impossible de vérifier ce code ou d’envoyer un code à votre nouvelle adresse. Réessayez ou recommencez.', changeFailed: 'Impossible de changer votre adresse courriel. Réessayez ou recommencez.', current: 'Adresse actuelle :', next: 'Nouvelle adresse :', storage: 'Ce navigateur ne peut pas conserver cette étape si vous changez de langue. Vous devrez peut-être demander un autre code.', title: 'Changer mon courriel', lead: 'Vérifiez votre adresse actuelle, puis votre nouvelle adresse avec deux codes.', sentCurrent: 'Un code vient d’être envoyé à votre adresse actuelle. Il expire dans 5 minutes.', sent: 'Si cette adresse peut être utilisée, un code vient d’y être envoyé. Il expire dans 5 minutes.', done: 'Votre courriel a été modifié. Toutes vos sessions sont fermées. Reconnectez-vous avec la nouvelle adresse.', save: 'Confirmer mon courriel', back: 'Retour à la connexion' },
    en: { loadFailed: 'We could not load your account. Try again.', retry: 'Retry', sendFailed: 'We could not send a code to your current address. Try again.', checkFailed: 'We could not check this code or send a code to your new address. Try again or start again.', changeFailed: 'We could not change your email. Try again or start again.', current: 'Current address:', next: 'New address:', storage: 'This browser cannot keep this step when you change language. You may need to request another code.', title: 'Change my email', lead: 'Verify your current address, then your new address with two codes.', sentCurrent: 'A code has just been sent to your current address. It expires in 5 minutes.', sent: 'If this address can be used, a code has just been sent there. It expires in 5 minutes.', done: 'Your email has changed. All sessions are closed. Sign in again with your new address.', save: 'Confirm my email', back: 'Back to sign-in' },
    es: { loadFailed: 'No pudimos cargar tu cuenta. Inténtalo de nuevo.', retry: 'Reintentar', sendFailed: 'No pudimos enviar un código a tu dirección actual. Inténtalo de nuevo.', checkFailed: 'No pudimos verificar este código o enviar un código a tu nueva dirección. Inténtalo de nuevo o vuelve a empezar.', changeFailed: 'No pudimos cambiar tu correo. Inténtalo de nuevo o vuelve a empezar.', current: 'Dirección actual:', next: 'Nueva dirección:', storage: 'Este navegador no puede conservar este paso si cambias de idioma. Puede que tengas que pedir otro código.', title: 'Cambiar mi correo', lead: 'Verifica tu dirección actual y luego tu nueva dirección con dos códigos.', sentCurrent: 'Acabamos de enviar un código a tu dirección actual. Vence en 5 minutos.', sent: 'Si esta dirección se puede usar, acabamos de enviarle un código. Vence en 5 minutos.', done: 'Tu correo ha cambiado. Todas tus sesiones están cerradas. Inicia sesión con tu nueva dirección.', save: 'Confirmar mi correo', back: 'Volver al inicio de sesión' }
  };

/** S-12: the same localized wait for sign-in and Account. */
export function throttleMessage(locale: Locale, minutes?: number): string {
  const text = copy[locale];
  return minutes === undefined ? text.rate : (minutes === 1 ? text.rateOne : text.rateMany).replace('{n}', String(minutes));
}
