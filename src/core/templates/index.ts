export interface EmailTemplate {
  id: string;
  name: {
    en: string;
    es: string;
  };
  description: {
    en: string;
    es: string;
  };
  category: 'pitch' | 'demo' | 'followup';
  subject: {
    en: string;
    es: string;
  };
  body: {
    en: string;
    es: string;
  };
}

export const NOVICE_TEMPLATES: EmailTemplate[] = [
  {
    id: 'template-pitch',
    name: {
      en: 'B2B Growth & Sales Pitch',
      es: 'Propuesta Comercial B2B'
    },
    description: {
      en: 'High-converting introduction focusing on measurable results and clear value proposition.',
      es: 'Presentación de alto impacto enfocada en resultados medibles y propuesta de valor clara.'
    },
    category: 'pitch',
    subject: {
      en: 'Quick question regarding {{companyName}} growth',
      es: 'Consulta breve sobre el crecimiento de {{companyName}}'
    },
    body: {
      en: 'Hi {{firstName}},\n\nNoticed {{companyName}} is expanding outbound sales efforts. We recently helped a similar B2B team book 45 qualified meetings last month by optimizing deliverability and sequence timing.\n\nWould you be open to a 5-minute chat next Tuesday?\n\nBest,\nAlex',
      es: 'Hola {{firstName}},\n\nVi que en {{companyName}} están buscando optimizar la captación de clientes. Hace poco ayudamos a una empresa similar a generar más de 35 reuniones cualificadas al mes optimizando sus secuencias.\n\n¿Tendrías 5 minutos este jueves para ver cómo lo hicimos?\n\nUn saludo,\nAlex'
    }
  },
  {
    id: 'template-demo',
    name: {
      en: 'Product Demo & Meeting Invite',
      es: 'Invitación a Demostración Rápida'
    },
    description: {
      en: 'Concise meeting invitation with low friction for executive decision-makers.',
      es: 'Invitación concisa y sin fricción para directivos y tomadores de decisión.'
    },
    category: 'demo',
    subject: {
      en: '10-minute demo for {{companyName}}',
      es: 'Demostración de 10 minutos para {{companyName}}'
    },
    body: {
      en: 'Hi {{firstName}},\n\nI have been following {{companyName}}\'s recent milestones and wanted to reach out directly.\n\nWe built a solution that cuts down manual sales prospecting by 70%. Would you be opposed to a brief 10-minute screen-share this week to see if it fits your roadmap?\n\nBest regards,\nAlex',
      es: 'Hola {{firstName}},\n\nHe estado siguiendo los avances de {{companyName}} y quería escribirte directamente.\n\nDesarrollamos una herramienta que reduce el tiempo manual de prospección en un 70%. ¿Estarías disponible para ver una demo rápida de 10 minutos esta semana?\n\nUn cordial saludo,\nAlex'
    }
  },
  {
    id: 'template-followup',
    name: {
      en: 'Gentle Value Follow-up',
      es: 'Seguimiento Rápido de Valor'
    },
    description: {
      en: 'Polite reminder in case your first note got buried, adding extra proof.',
      es: 'Recordatorio educado por si el primer correo quedó sepultado en la bandeja.'
    },
    category: 'followup',
    subject: {
      en: 'Re: Quick question regarding {{companyName}} growth',
      es: 'Re: Consulta breve sobre el crecimiento de {{companyName}}'
    },
    body: {
      en: 'Hi {{firstName}},\n\nWanted to quickly follow up in case my previous note got buried in your inbox.\n\nAre you available for a brief conversation this week, or should I reach back out next quarter?\n\nBest,\nAlex',
      es: 'Hola {{firstName}},\n\nTe escribo brevemente por si se te pasó mi correo anterior.\n\n¿Tendrías unos minutos para hablar esta semana, o prefieres que retomemos el contacto el próximo mes?\n\nUn saludo,\nAlex'
    }
  }
];
