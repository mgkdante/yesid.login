/**
 * The login service's privacy policy and terms, in the structure and voice of yesid.dev's legal pages.
 * Written from Yesito's recorded decisions and the service as built. No lawyer has reviewed them yet (S14).
 * Wording is legal text: change it deliberately, keep the three languages in step, and update `LEGAL_UPDATED`.
 */
import type { Locale } from '../copy.ts';

export interface LegalSection {
  heading: string;
  paragraphs?: readonly string[];
  list?: readonly string[];
  after?: readonly string[];
  subsections?: readonly LegalSection[];
}
export interface LegalPage {
  title: string;
  intro: string;
  updatedLabel: string;
  sections: readonly LegalSection[];
}

export const LEGAL_UPDATED = '2026-11-08';
export const LEGAL_CONTACT = 'contact@yesid.dev';

export const privacy: Record<Locale, LegalPage> = {
  fr: {
    title: 'Politique de confidentialité',
    intro: 'Cette politique explique quels renseignements personnels le service de connexion recueille, pourquoi, où ils vont et quels droits la loi québécoise vous donne sur eux. Elle vise les personnes qui modifient le site d’un client. En bref : un courriel, un code temporaire et un journal des modifications. Aucun mot de passe, aucune donnée de paiement.',
    updatedLabel: 'Dernière mise à jour :',
    sections: [
      { heading: 'Qui je suis', paragraphs: ['login.yesid.dev est le service de connexion et l’éditeur de site de Yesid Fernando Otalora, qui exploite une entreprise individuelle au Québec, au Canada. Il permet aux propriétaires et aux employés de modifier le site d’un client. Cette politique ne vise pas les visiteurs du site d’un client ni les formulaires de ce site : chaque site a sa propre politique.'] },
      { heading: 'Lois applicables', paragraphs: ['yesid.dev est une entreprise québécoise : cette politique répond d’abord à la Loi sur la protection des renseignements personnels dans le secteur privé, modernisée par la Loi 25, reconnue comme essentiellement similaire à la loi fédérale. Lorsque des renseignements personnels traversent les frontières provinciales ou nationales, ou lorsque je travaille avec des clients ailleurs au Canada, la Loi sur la protection des renseignements personnels et les documents électroniques (LPRPDE) s’applique également. Je m’en tiens à la plus forte des deux protections.'] },
      { heading: 'Ce que je recueille et comment', list: [
        'Votre adresse courriel, ajoutée par le propriétaire du site ou par moi.',
        'Un nom affiché, s’il y en a un; c’est souvent simplement le nom du site.',
        'Le site auquel vous avez accès et votre rôle.',
        'Des codes de connexion, conservés seulement sous forme chiffrée par hachage.',
        'Vos sessions de connexion.',
        'Un journal de ce qui a été modifié, quand et par quel identifiant interne, ainsi que des ajouts et retraits de personnes.',
        'Des données techniques comme votre adresse IP, pour limiter les tentatives et protéger le service.'
      ], subsections: [
        { heading: 'Préférences conservées dans votre navigateur', paragraphs: ['Votre navigateur garde aussi votre session, votre langue et votre thème sur votre appareil pour que le service fonctionne.'] },
        { heading: 'Comptage des visites', paragraphs: ['Je compte les visites des pages de connexion, de compte, des personnes et des pages juridiques avec Plausible Analytics, pour voir comment le service est utilisé. L’éditeur de site n’est pas compté. Au chargement d’une de ces pages, votre navigateur envoie à login.yesid.dev, qui le transmet à Plausible, le nom de la page, où le nom du site du client est remplacé par un nom générique et le reste de l’adresse est retiré, sauf les balises de campagne du lien, ainsi que le site d’origine (son adresse sans le chemin). Le service transmet aussi à Plausible votre adresse IP et votre agent utilisateur, dont Plausible tire les catégories de navigateur, de système d’exploitation et d’appareil : Plausible déduit de l’adresse IP un pays, une région et une ville approximatifs et combine les deux valeurs à un sel renouvelé chaque jour pour compter les visiteurs de la journée, puis les élimine. Plausible n’utilise ni témoins, ni stockage du navigateur, ni identifiant persistant. Pour vous y opposer, écrivez à contact@yesid.dev.'] }
      ] },
      { heading: 'Pourquoi je les recueille', list: [
        'Vous envoyer un code et vous connecter.',
        'Vérifier à chaque demande que vous avez accès à ce site.',
        'Vous prévenir, ou prévenir le propriétaire, d’un ajout ou d’un changement d’adresse.',
        'Savoir qui a modifié quoi et régler les problèmes de sécurité.',
        'Compter les visites de ces pages et voir comment le service est utilisé.'
      ] },
      { heading: 'Où vont vos renseignements', paragraphs: ['Ces fournisseurs traitent des renseignements à l’extérieur du Québec :'], list: [
        'Cloudflare : héberge le service et sa base de données. Courriel, codes hachés, sessions et journaux.',
        'Resend, aux États-Unis : envoie les courriels. Courriel et code.',
        'GitHub : conserve le contenu du site et ses modifications. Le service y ajoute un identifiant interne, et non votre nom ou votre courriel.',
        'Google, par l’API Gemini, seulement si vous utilisez la traduction de l’éditeur : le texte que vous choisissez de traduire, envoyé depuis votre navigateur avec votre propre clé Google. Si votre clé utilise l’offre gratuite de Google, Google peut utiliser ce texte pour améliorer ses produits et des personnes chez Google peuvent le lire : ne traduisez pas de renseignements personnels ou confidentiels.',
        'Plausible Analytics (Plausible Insights OÜ, Estonie) : compte les visites des pages de connexion. Les données de visite sont traitées et conservées dans l’Union européenne.'
      ], after: [
        'Le propriétaire d’un site voit l’adresse courriel, le rôle, l’état et la dernière modification de chaque personne de ce site, et rien sur d’autres sites. Je peux voir ces renseignements pour faire fonctionner le service.',
        'À chaque modification enregistrée dans le dépôt du site, le service ajoute un identifiant interne, et non votre nom ou votre courriel. Ce que vous écrivez vous-même, dans le contenu ou le titre d’une modification, y est enregistré tel quel, sauf un titre contenant une adresse courriel, remplacé par un titre générique.'
      ] },
      { heading: 'Ce que je ne fais pas', list: [
        'Aucune vente de vos renseignements et aucun partage à des fins publicitaires.',
        'Aucune publicité et aucun suivi d’un site ou d’un appareil à l’autre.',
        'Aucun mot de passe et aucune donnée de paiement.'
      ] },
      { heading: 'Conservation', list: [
        'Codes de connexion : valides 5 minutes, puis supprimés au prochain nettoyage quotidien.',
        'Sessions : valides 8 heures au plus, puis supprimées au prochain nettoyage quotidien.',
        'Données techniques servant à limiter les tentatives, comme votre adresse IP : supprimées après 1 jour.',
        'Journaux : supprimés automatiquement par ce nettoyage une fois qu’ils ont 12 mois.',
        'Invitations non utilisées : elles expirent après 7 jours.',
        'Compte : tant que vous avez accès à un site. Après votre retrait, il est supprimé par ce nettoyage une fois qu’aucun journal ne s’y rattache, normalement au plus environ 12 mois plus tard.',
        'Comptage des visites : Plausible ne conserve que des statistiques agrégées et ne conserve jamais votre adresse IP ni votre agent utilisateur.',
        'Copies conservées par les fournisseurs : Resend garde les courriels qu’il envoie, codes compris, pendant 30 jours; Cloudflare garde les journaux du service jusqu’à 7 jours et peut remettre la base de données dans son état de n’importe quel moment des 7 derniers jours; GitHub garde vos modifications dans l’historique du site.'
      ], after: ['Le nettoyage s’exécute une fois par jour. S’il échoue, la suppression attend le suivant.'] },
      { heading: 'Sécurité', paragraphs: ['Je réduis les risques d’abord en recueillant peu. Pour le reste : les codes sont conservés sous forme chiffrée par hachage et expirent en 5 minutes, les sessions durent 8 heures au plus et chaque demande vérifie que vous avez accès à ce site. Aucun système n’est parfaitement sûr, et je ne prétendrai pas le contraire.'] },
      { heading: 'Vos droits', paragraphs: ['Selon la loi québécoise sur la protection des renseignements personnels dans le secteur privé, vous pouvez demander l’accès à vos renseignements, leur correction ou leur suppression, et poser des questions sur leur traitement. Écrivez à contact@yesid.dev : je réponds par écrit dans les 30 jours. Vous pouvez changer votre courriel vous-même une fois connecté, à login.yesid.dev/account, ou demander au propriétaire de votre site de vous retirer.'] },
      { heading: 'Incidents de confidentialité', paragraphs: ['Je tiens un registre des incidents de confidentialité et, si un incident visant vos renseignements personnels présente un risque de préjudice sérieux, je vous en aviserai ainsi que la Commission d’accès à l’information du Québec, comme la loi l’exige.'] },
      { heading: 'Responsable de la protection des renseignements personnels', paragraphs: ['Je suis la personne responsable de la protection des renseignements personnels pour ce service. Titre : Responsable de la protection des renseignements personnels. Nom : Yesid Fernando Otalora. Contact : contact@yesid.dev.'] },
      { heading: 'Plaintes', paragraphs: ['Si le traitement de vos renseignements personnels vous préoccupe, écrivez-moi d’abord à contact@yesid.dev. Si ma réponse ne vous satisfait pas, vous pouvez porter plainte auprès de la Commission d’accès à l’information du Québec (CAI), l’organisme public qui veille à la protection des renseignements personnels au Québec. Pour les situations relevant de la loi fédérale, par exemple si vous êtes à l’extérieur du Québec, vous pouvez aussi vous adresser au Commissariat à la protection de la vie privée du Canada.'] },
      { heading: 'Modifications de cette politique', paragraphs: ['Si je modifie cette politique, je mettrai à jour cette page et la date indiquée en haut. Si un changement touche de façon importante le traitement de vos renseignements personnels, je l’indiquerai clairement ici.'] },
      { heading: 'Contact', paragraphs: ['Pour toute question sur cette politique ou sur vos renseignements personnels : contact@yesid.dev. Vous pouvez m’écrire en français, en anglais ou en espagnol.'] }
    ]
  },
  en: {
    title: 'Privacy Policy',
    intro: 'This policy explains what personal information the login service collects, why, where it goes and the rights Quebec law gives you over it. It covers people who edit a client’s site. The short version: an email address, a temporary code and a log of edits. No passwords and no payment data.',
    updatedLabel: 'Last updated:',
    sections: [
      { heading: 'Who I am', paragraphs: ['login.yesid.dev is the sign-in service and site editor of Yesid Fernando Otalora, operating as a sole proprietor in Quebec, Canada. It lets Owners and Employees edit a client’s site. This policy does not cover visitors to a client’s site or that site’s forms: each site has its own policy.'] },
      { heading: 'Which laws apply', paragraphs: ['yesid.dev is a Quebec business, so this policy is written first for Quebec’s Act respecting the protection of personal information in the private sector, as modernized by Law 25, which is recognized as substantially similar to Canada’s federal law. When personal information crosses provincial or national borders, or when I work with clients elsewhere in Canada, the federal Personal Information Protection and Electronic Documents Act (PIPEDA) applies as well. I hold myself to whichever protection is stronger.'] },
      { heading: 'What I collect and how', list: [
        'Your email address, added by the site’s Owner or by me.',
        'A display name, if there is one; it is often just the site’s name.',
        'The site you can access and your role.',
        'Sign-in codes, kept only in hashed form.',
        'Your sign-in sessions.',
        'A log of what was edited, when and by which internal ID, and of people being added and removed.',
        'Technical data such as your IP address, to limit attempts and protect the service.'
      ], subsections: [
        { heading: 'Preferences stored in your browser', paragraphs: ['Your browser also keeps your session, language and theme on your device so the service works.'] },
        { heading: 'Visit counts', paragraphs: ['I count visits to the sign-in, account, people and legal pages with Plausible Analytics, to see how the service is used. The site editor is not counted. When one of these pages loads, your browser sends login.yesid.dev, which forwards it to Plausible, the name of the page, with the client site’s name replaced by a placeholder and the rest of the address removed except campaign tags in the link, and the referring site (its address without the path). The service also passes Plausible your IP address and User-Agent, from which Plausible takes your browser, operating-system and device category: Plausible derives an approximate country, region and city from the IP address and combines both values with a salt that changes every day to count that day’s visitors, then discards them. Plausible uses no cookies, no browser storage and no persistent identifier. To object, write to contact@yesid.dev.'] }
      ] },
      { heading: 'Why I collect it', list: [
        'To send you a code and sign you in.',
        'To check on every request that you have access to that site.',
        'To tell you or the Owner about an addition or a change of address.',
        'To know who edited what, and to deal with security problems.',
        'To count visits to these pages and see how the service is used.'
      ] },
      { heading: 'Where it goes', paragraphs: ['These providers process information outside Quebec:'], list: [
        'Cloudflare: hosts the service and its database. Email, hashed codes, sessions and logs.',
        'Resend, in the United States: sends the emails. Email and code.',
        'GitHub: stores the site’s content and its edits. The service adds an internal ID there, not your name or email.',
        'Google, through the Gemini API, only if you use the editor’s translation: the text you choose to translate, sent from your browser with your own Google key. If your key uses Google’s free tier, Google may use that text to improve its products and people at Google may read it, so do not translate personal or confidential information.',
        'Plausible Analytics (Plausible Insights OÜ, Estonia): counts visits to the sign-in pages. Visit data is processed and stored in the European Union.'
      ], after: [
        'A site’s Owner sees the email address, role, status and last edit of each person on that site, and nothing about other sites. I can see this information to run the service.',
        'To each edit saved in the site’s repository, the service adds an internal ID, not your name or email. What you write yourself, in the content or in an edit’s title, is saved there as written, except that a title containing an email address is replaced with a generic one.'
      ] },
      { heading: 'What I do not do', list: [
        'No selling of your information and no sharing it for advertising.',
        'No advertising, and no tracking across sites or devices.',
        'No passwords and no payment data.'
      ] },
      { heading: 'Retention', list: [
        'Sign-in codes: valid for 5 minutes, then deleted by the next daily cleanup.',
        'Sessions: valid for 8 hours at most, then deleted by the next daily cleanup.',
        'Technical data used to limit attempts, such as your IP address: deleted after 1 day.',
        'Logs: deleted automatically by the same cleanup once they are 12 months old.',
        'Unused invitations: they expire after 7 days.',
        'Account: as long as you have access to a site. After you are removed, it is deleted by the same cleanup once no log refers to it, normally no more than about 12 months later.',
        'Visit counts: Plausible keeps only aggregate statistics and never stores your IP address or User-Agent.',
        'Copies kept by providers: Resend keeps the emails it sends, codes included, for 30 days; Cloudflare keeps service logs for up to 7 days and can return the database to its state at any moment in the last 7 days; GitHub keeps your edits in the site’s history.'
      ], after: ['The cleanup runs once a day. If a run fails, deletion waits for the next one.'] },
      { heading: 'Security', paragraphs: ['I reduce risk first by collecting little. Beyond that: codes are kept only in hashed form and expire in 5 minutes, sessions last 8 hours at most, and every request checks that you have access to that site. No system is perfectly secure, and I will not pretend otherwise.'] },
      { heading: 'Your rights', paragraphs: ['Under Quebec’s Act respecting the protection of personal information in the private sector, you can ask to access, correct or delete your information, and ask questions about how it is handled. Write to contact@yesid.dev: I answer in writing within 30 days. You can change your own email once signed in, at login.yesid.dev/account, or ask your site’s Owner to remove you.'] },
      { heading: 'Confidentiality incidents', paragraphs: ['I keep a register of confidentiality incidents, and if an incident involving your personal information presents a risk of serious injury, I will notify you and the Commission d’accès à l’information du Québec, as the law requires.'] },
      { heading: 'Privacy Officer', paragraphs: ['I am the person in charge of the protection of personal information for this service. Title: Privacy Officer. Name: Yesid Fernando Otalora. Contact: contact@yesid.dev.'] },
      { heading: 'Complaints', paragraphs: ['If anything about how I handle your personal information concerns you, please contact me first at contact@yesid.dev. If my answer does not satisfy you, you may file a complaint with the Commission d’accès à l’information du Québec (CAI), the public body that oversees the protection of personal information in Quebec. For matters that fall under federal law, for example if you are outside Quebec, you may also contact the Office of the Privacy Commissioner of Canada.'] },
      { heading: 'Changes to this policy', paragraphs: ['If I change this policy, I will update this page and the date at the top. If a change materially affects how your personal information is handled, I will say so plainly here.'] },
      { heading: 'Contact', paragraphs: ['For any question about this policy or about your personal information: contact@yesid.dev. You are welcome to write in English, French or Spanish.'] }
    ]
  },
  es: {
    title: 'Política de privacidad',
    intro: 'Esta política explica qué información personal recopila el servicio de inicio de sesión, por qué, a dónde va y qué derechos le da la ley de Quebec sobre ella. Se aplica a las personas que editan el sitio de un cliente. En resumen: un correo electrónico, un código temporal y un registro de ediciones. Sin contraseñas ni datos de pago.',
    updatedLabel: 'Última actualización:',
    sections: [
      { heading: 'Quién soy', paragraphs: ['login.yesid.dev es el servicio de inicio de sesión y el editor de sitios de Yesid Fernando Otalora, quien opera una empresa individual en Quebec, Canadá. Permite a los propietarios y empleados editar el sitio de un cliente. Esta política no cubre a los visitantes del sitio de un cliente ni los formularios de ese sitio: cada sitio tiene su propia política.'] },
      { heading: 'Qué leyes se aplican', paragraphs: ['yesid.dev es una empresa de Quebec, así que esta política está escrita primero para la Ley de protección de la información personal en el sector privado (Quebec), modernizada por la Ley 25 de Quebec, reconocida como esencialmente similar a la ley federal de Canadá. Cuando la información personal cruza fronteras provinciales o nacionales, o cuando trabajo con clientes en otras partes de Canadá, también se aplica PIPEDA (la ley federal canadiense de protección de datos personales). Me atengo siempre a la protección que sea más fuerte.'] },
      { heading: 'Qué recopilo y cómo', list: [
        'Su correo electrónico, añadido por el propietario del sitio o por mí.',
        'Un nombre visible, si lo hay; a menudo es solo el nombre del sitio.',
        'El sitio al que tiene acceso y su rol.',
        'Códigos de inicio de sesión, guardados solo en forma de hash.',
        'Sus sesiones.',
        'Un registro de qué se editó, cuándo y con qué identificador interno, y de las personas añadidas y quitadas.',
        'Datos técnicos como su dirección IP, para limitar los intentos y proteger el servicio.'
      ], subsections: [
        { heading: 'Preferencias guardadas en su navegador', paragraphs: ['Su navegador también guarda su sesión, idioma y tema en su dispositivo para que el servicio funcione.'] },
        { heading: 'Recuento de visitas', paragraphs: ['Cuento las visitas a las páginas de inicio de sesión, de cuenta, de personas y legales con Plausible Analytics, para ver cómo se usa el servicio. El editor del sitio no se cuenta. Cuando se carga una de estas páginas, su navegador envía a login.yesid.dev, que lo reenvía a Plausible, el nombre de la página, con el nombre del sitio del cliente sustituido por uno genérico y el resto de la dirección eliminado salvo las etiquetas de campaña del enlace, y el sitio de referencia (su dirección sin la ruta). El servicio también pasa a Plausible su dirección IP y su agente de usuario, de los que Plausible obtiene su tipo de navegador, sistema operativo y dispositivo: Plausible deduce de la dirección IP un país, una región y una ciudad aproximados y combina ambos valores con una sal que cambia cada día para contar los visitantes de ese día, y luego los descarta. Plausible no usa cookies, ni almacenamiento del navegador, ni identificadores persistentes. Para oponerse, escriba a contact@yesid.dev.'] }
      ] },
      { heading: 'Por qué la recopilo', list: [
        'Para enviarle un código e iniciar su sesión.',
        'Para comprobar en cada solicitud que tiene acceso a ese sitio.',
        'Para avisarle a usted o al propietario de una incorporación o de un cambio de correo.',
        'Para saber quién editó qué y resolver problemas de seguridad.',
        'Para contar las visitas a estas páginas y ver cómo se usa el servicio.'
      ] },
      { heading: 'A dónde va', paragraphs: ['Estos proveedores tratan información fuera de Quebec:'], list: [
        'Cloudflare: aloja el servicio y su base de datos. Correo, códigos en hash, sesiones y registros.',
        'Resend, en Estados Unidos: envía los correos. Correo y código.',
        'GitHub: guarda el contenido del sitio y sus ediciones. El servicio añade allí un identificador interno, no su nombre ni su correo.',
        'Google, mediante la API de Gemini, solo si usted usa la traducción del editor: el texto que elige traducir, enviado desde su navegador con su propia clave de Google. Si su clave usa el nivel gratuito de Google, Google puede usar ese texto para mejorar sus productos y personas de Google pueden leerlo: no traduzca información personal ni confidencial.',
        'Plausible Analytics (Plausible Insights OÜ, Estonia): cuenta las visitas a las páginas de inicio de sesión. Los datos de las visitas se procesan y almacenan en la Unión Europea.'
      ], after: [
        'El propietario de un sitio ve el correo, el rol, el estado y la última edición de cada persona de ese sitio, y nada sobre otros sitios. Yo puedo ver esta información para operar el servicio.',
        'A cada edición guardada en el repositorio del sitio, el servicio añade un identificador interno, no su nombre ni su correo. Lo que usted escribe, en el contenido o en el título de una edición, se guarda allí tal como lo escribe, salvo un título con una dirección de correo, que se sustituye por uno genérico.'
      ] },
      { heading: 'Lo que no hago', list: [
        'Sin venta de su información y sin compartirla con fines publicitarios.',
        'Sin publicidad y sin rastreo entre sitios o dispositivos.',
        'Sin contraseñas y sin datos de pago.'
      ] },
      { heading: 'Conservación', list: [
        'Códigos de inicio de sesión: válidos durante 5 minutos, luego se eliminan en la siguiente limpieza diaria.',
        'Sesiones: válidas 8 horas como máximo, luego se eliminan en la siguiente limpieza diaria.',
        'Datos técnicos usados para limitar los intentos, como su dirección IP: se eliminan después de 1 día.',
        'Registros: esa limpieza los elimina automáticamente cuando cumplen 12 meses.',
        'Invitaciones sin usar: vencen después de 7 días.',
        'Cuenta: mientras tenga acceso a un sitio. Después de que lo quiten, esa limpieza la elimina cuando ningún registro se refiera a ella, normalmente como máximo unos 12 meses después.',
        'Recuento de visitas: Plausible solo guarda estadísticas agregadas y nunca guarda su dirección IP ni su agente de usuario.',
        'Copias que guardan los proveedores: Resend guarda los correos que envía, incluidos los códigos, durante 30 días; Cloudflare guarda los registros del servicio hasta 7 días y puede devolver la base de datos a su estado en cualquier momento de los últimos 7 días; GitHub guarda sus ediciones en el historial del sitio.'
      ], after: ['La limpieza se ejecuta una vez al día. Si falla, la eliminación espera a la siguiente.'] },
      { heading: 'Seguridad', paragraphs: ['Reduzco el riesgo, ante todo, recopilando poco. Más allá de eso: los códigos se guardan solo en forma de hash y vencen en 5 minutos, las sesiones duran 8 horas como máximo y cada solicitud comprueba que usted tiene acceso a ese sitio. Ningún sistema es perfectamente seguro, y no voy a fingir lo contrario.'] },
      { heading: 'Sus derechos', paragraphs: ['Según la ley de Quebec sobre la protección de la información personal en el sector privado, usted puede pedir acceso a su información, su corrección o su eliminación, y hacer preguntas sobre su tratamiento. Escriba a contact@yesid.dev: respondo por escrito en un plazo de 30 días. Puede cambiar su correo una vez iniciada la sesión, en login.yesid.dev/account, o pedir al propietario de su sitio que lo quite.'] },
      { heading: 'Incidentes de confidencialidad', paragraphs: ['Llevo un registro de los incidentes de confidencialidad y, si un incidente que involucre su información personal presenta un riesgo de perjuicio serio, se lo notificaré a usted y a la Comisión de acceso a la información de Quebec (CAI, Commission d’accès à l’information du Québec), como lo exige la ley.'] },
      { heading: 'Responsable de privacidad', paragraphs: ['Yo soy la persona a cargo de la protección de la información personal de este servicio. Cargo: Responsable de privacidad. Nombre: Yesid Fernando Otalora. Contacto: contact@yesid.dev.'] },
      { heading: 'Quejas', paragraphs: ['Si algo en la manera en que manejo su información personal le preocupa, por favor contácteme primero en contact@yesid.dev. Si mi respuesta no le satisface, puede presentar una queja ante la Comisión de acceso a la información de Quebec (CAI), el organismo público que supervisa la protección de la información personal en Quebec. Para asuntos que corresponden a la ley federal, por ejemplo si usted está fuera de Quebec, también puede contactar al Comisionado de Privacidad de Canadá.'] },
      { heading: 'Cambios a esta política', paragraphs: ['Si cambio esta política, actualizaré esta página y la fecha que aparece arriba. Si un cambio afecta de manera sustancial la forma en que se maneja su información personal, lo diré aquí con claridad.'] },
      { heading: 'Contacto', paragraphs: ['Para cualquier pregunta sobre esta política o sobre su información personal: contact@yesid.dev. Con gusto puede escribirme en español, inglés o francés.'] }
    ]
  }
};

export const terms: Record<Locale, LegalPage> = {
  fr: {
    title: 'Conditions d’utilisation',
    intro: 'Ces conditions s’appliquent au service de connexion et à l’éditeur de site offerts à login.yesid.dev, exploités par Yesid Fernando Otalora, travailleur autonome au Québec, Canada. En vous connectant, vous les acceptez.',
    updatedLabel: 'Dernière mise à jour :',
    sections: [
      { heading: 'Ce qu’est ce service', paragraphs: ['Il permet aux personnes autorisées de modifier le contenu du site d’un client, sans mot de passe. Toute entente sur la création ou l’entretien d’un site est distincte et l’emporte sur ces conditions en cas de contradiction.'] },
      { heading: 'Qui peut l’utiliser', paragraphs: ['Seules les personnes ajoutées par le propriétaire du site, ou par moi, peuvent se connecter. Le propriétaire décide qui a accès à son site et il est responsable des personnes qu’il ajoute.'] },
      { heading: 'Votre accès', list: [
        'Votre code est personnel. Ne le partagez avec personne.',
        'Utilisez une adresse courriel à laquelle vous seul avez accès.',
        'Si vous pensez que quelqu’un d’autre a accès à votre compte, écrivez à contact@yesid.dev sans tarder.'
      ] },
      { heading: 'Votre contenu', paragraphs: ['Le contenu du site appartient à son propriétaire ou à ceux dont il tient ses droits, et il répond de ce que le site affirme. Une modification enregistrée peut être publiée sur le site en ligne automatiquement, en quelques minutes : relisez avant d’enregistrer.'] },
      { heading: 'Utilisation acceptable', paragraphs: ['Vous acceptez de ne pas :'], list: [
        'publier un contenu illégal ou trompeur, ou qui porte atteinte aux droits d’autrui;',
        'tenter de contourner les limites d’accès, ni d’atteindre le site d’un autre client;',
        'perturber ou surcharger le service, ou l’utiliser pour envoyer des messages indésirables.'
      ] },
      { heading: 'Retrait d’accès', paragraphs: ['Le propriétaire peut retirer un employé à tout moment. Je peux suspendre un accès pour protéger le service ou un site, ou en cas de non-respect de ces conditions.'] },
      { heading: 'Absence de garantie', paragraphs: ['Le service est offert tel quel. Je travaille à le garder fiable et sécuritaire, mais je ne garantis pas qu’il sera toujours disponible ou sans erreur. Il repose aussi sur des fournisseurs que je ne contrôle pas.'] },
      { heading: 'Limitation de responsabilité', paragraphs: ['Dans la mesure permise par la loi applicable, je ne suis pas responsable des dommages indirects découlant de l’utilisation du service. Rien dans ces conditions n’exclut ni ne limite une responsabilité qui ne peut l’être selon les lois du Québec.'] },
      { heading: 'Vos renseignements personnels', paragraphs: ['La politique de confidentialité explique comment ils sont traités.'] },
      { heading: 'Droit applicable', paragraphs: ['Ces conditions sont régies par les lois du Québec et les lois du Canada qui s’y appliquent. Sous réserve de toute règle d’ordre public vous accordant un autre tribunal, les litiges relèvent des tribunaux compétents du district judiciaire de Montréal.'] },
      { heading: 'Modifications', paragraphs: ['Je peux mettre à jour ces conditions. La date en haut de la page indique la version en vigueur. Continuer d’utiliser le service après une mise à jour signifie que vous l’acceptez.'] },
      { heading: 'Contact', paragraphs: ['Écrivez à contact@yesid.dev, en français, en anglais ou en espagnol.'] }
    ]
  },
  en: {
    title: 'Terms of Use',
    intro: 'These terms apply to the login service and site editor at login.yesid.dev, run by Yesid Fernando Otalora, a sole proprietor in Quebec, Canada. By signing in, you accept them.',
    updatedLabel: 'Last updated:',
    sections: [
      { heading: 'What this service is', paragraphs: ['It lets authorized people edit the content of a client’s site, without a password. Any agreement about building or maintaining a site is separate, and it prevails over these terms if they conflict.'] },
      { heading: 'Who can use it', paragraphs: ['Only people added by the site’s Owner, or by me, can sign in. The Owner decides who has access to their site and is responsible for the people they add.'] },
      { heading: 'Your access', list: [
        'Your code is personal. Do not share it with anyone.',
        'Use an email address that only you can access.',
        'If you think someone else has access to your account, write to contact@yesid.dev right away.'
      ] },
      { heading: 'Your content', paragraphs: ['A site’s content belongs to its Owner or to those they hold rights from, and the Owner answers for what the site says. A saved edit can go live on the site automatically within minutes, so check it before saving.'] },
      { heading: 'Acceptable use', paragraphs: ['You agree not to:'], list: [
        'publish content that is illegal or deceptive, or that infringes the rights of others;',
        'try to get around access limits or reach another client’s site;',
        'disrupt or overload the service, or use it to send unwanted messages.'
      ] },
      { heading: 'Removing access', paragraphs: ['The Owner can remove an Employee at any time. I can suspend access to protect the service or a site, or if these terms are not followed.'] },
      { heading: 'No warranty', paragraphs: ['The service is provided as is. I work to keep it reliable and secure, but I do not guarantee it will always be available or free of errors. It also relies on providers I do not control.'] },
      { heading: 'Limitation of liability', paragraphs: ['To the extent permitted by applicable law, I am not liable for indirect damages arising from your use of the service. Nothing in these terms excludes or limits any liability that cannot be excluded or limited under the laws of Quebec.'] },
      { heading: 'Your personal information', paragraphs: ['The privacy policy explains how it is handled.'] },
      { heading: 'Governing law', paragraphs: ['These terms are governed by the laws of Quebec and the applicable laws of Canada. Subject to any rule of public order that grants you a different forum, disputes will be brought before the competent courts of the judicial district of Montreal.'] },
      { heading: 'Changes', paragraphs: ['I may update these terms. The date at the top of the page shows the current version. If you keep using the service after an update, the updated terms apply to you.'] },
      { heading: 'Contact', paragraphs: ['Write to contact@yesid.dev, in English, French or Spanish.'] }
    ]
  },
  es: {
    title: 'Condiciones de uso',
    intro: 'Estas condiciones se aplican al servicio de inicio de sesión y al editor de sitios de login.yesid.dev, operados por Yesid Fernando Otalora, trabajador independiente en Quebec, Canadá. Al iniciar sesión, usted las acepta.',
    updatedLabel: 'Última actualización:',
    sections: [
      { heading: 'Qué es este servicio', paragraphs: ['Permite a las personas autorizadas editar el contenido del sitio de un cliente, sin contraseña. Cualquier acuerdo sobre la creación o el mantenimiento de un sitio es independiente y prevalece sobre estas condiciones en caso de contradicción.'] },
      { heading: 'Quién puede usarlo', paragraphs: ['Solo pueden iniciar sesión las personas añadidas por el propietario del sitio o por mí. El propietario decide quién tiene acceso a su sitio y es responsable de las personas que añade.'] },
      { heading: 'Su acceso', list: [
        'Su código es personal. No lo comparta con nadie.',
        'Use un correo electrónico al que solo usted tenga acceso.',
        'Si cree que otra persona tiene acceso a su cuenta, escriba a contact@yesid.dev de inmediato.'
      ] },
      { heading: 'Su contenido', paragraphs: ['El contenido de un sitio pertenece a su propietario o a quienes le otorgan sus derechos, y el propietario responde de lo que dice el sitio. Una edición guardada puede publicarse automáticamente en el sitio en pocos minutos, así que revísela antes de guardar.'] },
      { heading: 'Uso aceptable', paragraphs: ['Usted acepta no:'], list: [
        'publicar contenido ilegal o engañoso, o que infrinja los derechos de otras personas;',
        'intentar eludir los límites de acceso ni llegar al sitio de otro cliente;',
        'interrumpir o sobrecargar el servicio, ni usarlo para enviar mensajes no deseados.'
      ] },
      { heading: 'Retirada del acceso', paragraphs: ['El propietario puede quitar a un empleado en cualquier momento. Puedo suspender un acceso para proteger el servicio o un sitio, o si no se cumplen estas condiciones.'] },
      { heading: 'Ausencia de garantía', paragraphs: ['El servicio se ofrece tal cual. Trabajo para mantenerlo fiable y seguro, pero no garantizo que esté siempre disponible ni libre de errores. También depende de proveedores que no controlo.'] },
      { heading: 'Limitación de responsabilidad', paragraphs: ['En la medida permitida por la ley aplicable, no soy responsable de los daños indirectos derivados del uso del servicio. Nada en estas condiciones excluye ni limita una responsabilidad que no pueda excluirse o limitarse según las leyes de Quebec.'] },
      { heading: 'Su información personal', paragraphs: ['La política de privacidad explica cómo se trata.'] },
      { heading: 'Ley aplicable', paragraphs: ['Estas condiciones se rigen por las leyes de Quebec y las leyes aplicables de Canadá. Sin perjuicio de cualquier norma de orden público que le conceda otro fuero, los litigios se someterán a los tribunales competentes del distrito judicial de Montreal.'] },
      { heading: 'Cambios', paragraphs: ['Puedo actualizar estas condiciones. La fecha en la parte superior indica la versión vigente. Si sigue usando el servicio después de una actualización, se aplican las condiciones actualizadas.'] },
      { heading: 'Contacto', paragraphs: ['Escriba a contact@yesid.dev, en español, francés o inglés.'] }
    ]
  }
};
