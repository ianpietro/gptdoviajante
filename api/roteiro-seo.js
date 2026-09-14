// api/roteiro-seo.js — Programmatic SEO Route Handler & Dense Travel Guides
const { 
  buildSeoRoutePath, 
  validateIndexationCriteria, 
  generateSeoStructuredData, 
  buildCloneCtaUrl,
  slugify 
} = require('../modules/seoProgrammaticEngine.js');

const RICH_DESTINATIONS = {
  'buenos-aires': {
    destination: 'Buenos Aires',
    durationDays: 3,
    title: 'Roteiro de 3 Dias em Buenos Aires: O Guia Definitivo Bairro a Bairro',
    description: 'Um itinerário denso e autoral por Buenos Aires com cronograma lógico e realista. Dicas reais de transporte com o cartão SUBE, câmbio paralelo sem pegadinhas, os melhores cortes de parrilla e como vivenciar a cultura portenha.',
    budgetEstimate: 'R$ 290 / dia por pessoa',
    bestSeason: 'Março a Maio (Outono) ou Setembro a Novembro (Primavera)',
    readinessScore: 9,
    readinessTotal: 9,
    copilotInsight: 'Buenos Aires se descobre caminhando por bairros contíguos. Adquira o cartão SUBE logo no desembarque. Para a Parrilla Don Julio, as reservas abrem com 60 dias de antecedência às 00:00 (horário argentino), mas se não conseguir, a fila de espera presencial às 11:30 garante mesas com aperitivo e espumante cortesia na calçada.',
    itinerary: [
      {
        dayNumber: 1,
        title: 'Dia 1: Recoleta Elegante, Cultura nos Cafés & Bosques de Palermo',
        summary: 'A influência europeia da Recoleta, livrarias históricas, alta gastronomia e os jardins de rosas.',
        dailyTransport: '🚶 Caminhada de 2,5km pela Recoleta + 🚕 Táxi/Cabify rápido para Palermo Soho',
        rainBackup: 'Se chover: Substitua os Bosques pelo MALBA (Museu de Arte Latino-Americana) para ver obras de Abaporu de Tarsila do Amaral e Frida Kahlo.',
        activities: [
          { 
            time: '08:30', 
            title: 'Café da Manhã Tradicional no La Biela', 
            category: 'Gastronomia Tradicional', 
            location: 'Av. Quintana 600, Recoleta', 
            duration: '1h 00min', 
            cost: '$4.500 ARS',
            transit: '🚇 Subte Linha H (Estação Las Heras - 5 min a pé)',
            tip: 'Sente-se na varanda sob a seringueira secular e comece o dia com um cortado e churros quentes com doce de leite.'
          },
          { 
            time: '10:00', 
            title: 'Cemitério da Recoleta & Basílica de Nossa Senhora do Pilar', 
            category: 'História & Arquitetura', 
            location: 'Junín 1760, Recoleta', 
            duration: '1h 30min', 
            cost: '$2.000 ARS',
            transit: '🚶 3 min a pé saindo do La Biela',
            tip: 'Procure o mausoléu da família Duarte onde repousa Evita Perón (seção 86). O guia de áudio por QR Code na entrada é gratuito.'
          },
          { 
            time: '11:45', 
            title: 'Livraria El Ateneo Grand Splendid', 
            category: 'Cultura & Arquitetura', 
            location: 'Av. Santa Fe 1860, Recoleta', 
            duration: '1h 15min', 
            cost: 'Entrada Franca',
            transit: '🚶 Caminhada agradável de 12 min pela Av. Santa Fe',
            tip: 'Antigo teatro de 1919 preservado com afrescos no teto e camarotes transformados em nichos de leitura.'
          },
          { 
            time: '13:30', 
            title: 'Almoço na Parrilla Don Julio ou El Preferido de Palermo', 
            category: 'Gastronomia Notável', 
            location: 'Guatemala 4699, Palermo Soho', 
            duration: '2h 00min', 
            cost: '$22.000 ARS',
            transit: '🚕 Táxi/Cabify de 12 min a partir da Recoleta',
            tip: 'Experimente o Ojo de Bife com morcilla de entrada e um vinho Malbec da casa. O atendimento é impecável.'
          },
          { 
            time: '16:00', 
            title: 'Rosedal de Palermo & Jardins Japoneses', 
            category: 'Natureza & Lazer', 
            location: 'Av. Infanta Isabel, Palermo', 
            duration: '2h 00min', 
            cost: 'Rosedal: Grátis | Jd. Japonês: $1.500 ARS',
            transit: '🚶 Caminhada de 15 min pelas ruas arborizadas de Palermo Soho',
            tip: 'São mais de 18.000 roseiras floridas. Ótimo ponto para caminhar sem pressa no fim de tarde.'
          },
          { 
            time: '20:00', 
            title: 'Jantar no Bairro de Palermo Hollywood (Niño Gordo ou La Carnicería)', 
            category: 'Gastronomia Noturna', 
            location: 'Thames 1810, Palermo', 
            duration: '2h 00min', 
            cost: '$18.000 ARS',
            transit: '🚕 Táxi de 10 min saindo dos parques',
            tip: 'Gastrobar moderno com fusão asiático-argentina ou cortes de carne artesanais defumados em lenha de quebracho.'
          }
        ]
      },
      {
        dayNumber: 2,
        title: 'Dia 2: Centro Histórico, Feira de San Telmo & Noite de Tango',
        summary: 'O berço da independência na Plaza de Mayo, antiquários de San Telmo e a magia do tango argentino.',
        dailyTransport: '🚶 Circuito a pé de 3,5km no centro antigo + 🚕 Táxi para o espetáculo noturno',
        rainBackup: 'Se chover: O galpão coberto do Mercado de San Telmo e a Catedral Metropolitana são 100% abrigados.',
        activities: [
          { 
            time: '08:30', 
            title: 'Café da Manhã no Emblemático Café Tortoni', 
            category: 'Gastronomia Histórica', 
            location: 'Av. de Mayo 825, Centro', 
            duration: '1h 00min', 
            cost: '$4.000 ARS',
            transit: '🚇 Subte Linha A (Estação Piedras - 1 min a pé)',
            tip: 'O café mais antigo de Buenos Aires (1858). Peça churros com chocolate quente em ambiente frequentado por Carlos Gardel.'
          },
          { 
            time: '10:00', 
            title: 'Plaza de Mayo, Casa Rosada e Catedral Metropolitana', 
            category: 'História & Política', 
            location: 'Plaza de Mayo, Centro', 
            duration: '1h 45min', 
            cost: 'Gratuito',
            transit: '🚶 Caminhada de 5 min pela Av. de Mayo',
            tip: 'Conheça o mausoléu do General San Martín na Catedral. A troca de guarda dos Granadeiros ocorre às 11:00 em ponto.'
          },
          { 
            time: '12:00', 
            title: 'Mercado de San Telmo & Antiquários na Calle Defensa', 
            category: 'Compras & Cultura', 
            location: 'Defensa 963, San Telmo', 
            duration: '1h 30min', 
            cost: 'Entrada Livre',
            transit: '🚶 Caminhada de 10 min pela Calle Defensa',
            tip: 'Galpão histórico de 1897. Experimente as empadas de carne assada cortada a cuchillo no famoso stand de El Hornero.'
          },
          { 
            time: '13:30', 
            title: 'Almoço no Bar El Federal ou La Brigada', 
            category: 'Gastronomia Tradicional', 
            location: 'Carlos Calvo 599, San Telmo', 
            duration: '1h 45min', 
            cost: '$16.000 ARS',
            transit: '🚶 4 min a pé a partir do Mercado',
            tip: 'Na La Brigada, os garçons cortam a carne suculenta usando apenas uma colher para demonstrar a maciez.'
          },
          { 
            time: '15:45', 
            title: 'Estátua da Mafalda & Ruelas de San Telmo', 
            category: 'Fotografia', 
            location: 'Esq. Chile e Defensa, San Telmo', 
            duration: '1h 00min', 
            cost: 'Gratuito',
            transit: '🚶 Caminhada rápida de 5 min',
            tip: 'A foto com Mafalda, Manolito e Susanita é gratuita. Conheça a ruela de paralelepípedos Pasaje Giuffra logo ao lado.'
          },
          { 
            time: '20:30', 
            title: 'Jantar & Show de Tango no Cafe de los Angelitos ou Tango Porteño', 
            category: 'Espetáculo Tradicional', 
            location: 'Av. Rivadavia 2100', 
            duration: '3h 00min', 
            cost: 'US$ 75 por pessoa',
            transit: '🚕 Táxi/Cabify de 15 min saindo do hotel',
            tip: 'Inclui jantar em 3 passos com vinhos argentinos ilimitados e show performático com orquestra de violinos e bandoneón.'
          }
        ]
      },
      {
        dayNumber: 3,
        title: 'Dia 3: Caminito Boêmio & As Docas Modernas de Puerto Madero',
        summary: 'Os contrastes entre as casas coloridas de cortiço e o horizonte futurista sobre o Rio da Prata.',
        dailyTransport: '🚕 Uber direto para La Boca + 🚶 Caminhada no calçadão marítimo de Puerto Madero',
        rainBackup: 'Se chover: Visite o Museu de Arte Amalia Lacroze de Fortabat nas docas de Puerto Madero.',
        activities: [
          { 
            time: '09:30', 
            title: 'Caminito & Estádio La Bombonera (La Boca)', 
            category: 'Cultura & Fotografia', 
            location: 'Calle Caminito, La Boca', 
            duration: '2h 00min', 
            cost: 'Gratuito (Museu do Boca: $4.000 ARS)',
            transit: '🚕 Uber/Cabify (Recomendado ir de táxi direto para a área turística de La Boca)',
            tip: 'Fachadas de chapa de ferro pintadas em cores vivas pelos imigrantes genoveses. Mantenha seus pertences junto ao corpo.'
          },
          { 
            time: '12:00', 
            title: 'Ponte da Mulher (Puente de la Mujer) & Diques de Puerto Madero', 
            category: 'Arquitetura', 
            location: 'Dique 3, Puerto Madero', 
            duration: '1h 30min', 
            cost: 'Gratuito',
            transit: '🚕 Táxi de 8 min saindo de La Boca para as docas',
            tip: 'A ponte móvel desenhada por Santiago Calatrava simboliza um casal dançando tango.'
          },
          { 
            time: '13:30', 
            title: 'Almoço em Puerto Madero (Cabaña Las Lilas ou Villegas)', 
            category: 'Gastronomia de Luxo', 
            location: 'Alicia Moreau de Justo 516, Puerto Madero', 
            duration: '2h 00min', 
            cost: '$26.000 ARS',
            transit: '🚶 Passeio pelo calçadão de pedestres',
            tip: 'Mesas com vista para o dique. A linguiça artesanal de entrada e os pães quentinhos são deliciosos.'
          },
          { 
            time: '16:00', 
            title: 'Passeio pela Reserva Ecológica Costanera Sur', 
            category: 'Natureza', 
            location: 'Av. Tristán Achával Rodríguez 1550', 
            duration: '1h 30min', 
            cost: 'Entrada Franca',
            transit: '🚶 Entrada a 5 min do Dique 4',
            tip: 'Reserva natural de 350 hectares nas margens do Rio da Prata. Ótimo local para tomar um sorvete Lucciano\'s.'
          },
          { 
            time: '19:00', 
            title: 'Pôr do Sol no Rooftop Trade Sky Bar', 
            category: 'Vida Noturna & Vista', 
            location: 'Av. Corrientes 222, Centro', 
            duration: '2h 00min', 
            cost: 'Drink: $6.500 ARS',
            transit: '🚶 12 min a pé cruzando a Av. Leandro N. Alem',
            tip: 'Eleito um dos 50 melhores rooftops do mundo pela Time Out. Vista panorâmica de 360° do Obelisco e do Rio da Prata.'
          }
        ]
      }
    ]
  },
  'roma': {
    destination: 'Roma',
    durationDays: 5,
    title: 'Roteiro de 5 Dias em Roma: Império Romano, Vaticano e o Charme de Trastevere',
    description: 'Guia completo e denso para Roma com cronograma perfeitamente espaçado. Como fugir de filas quilométricas no Coliseu e Vaticano com rotas certeiras, transporte público simples e trattorias autênticas.',
    budgetEstimate: 'R$ 450 / dia por pessoa',
    bestSeason: 'Abril a Junho / Setembro a Outubro',
    readinessScore: 9,
    readinessTotal: 9,
    copilotInsight: 'Compre bilhetes do Coliseu e Vaticano com exatos 30 dias de antecedência. Em Roma, a água potável das fontes públicas (Nasoni) é gratuita e gelada. Para ir do Aeroporto Fiumicino ao centro, use o trem expresso Leonardo Express (32 min até a Estação Termini).',
    itinerary: [
      {
        dayNumber: 1,
        title: 'Dia 1: A Roma Antiga dos Gladiadores e Imperadores',
        summary: 'Coliseu, Fórum Romano, Monte Palatino e o Altare della Patria.',
        dailyTransport: '🚇 Metrô Linha B (Estação Colosseo) + 🚶 Circuito pedonal de 2,5km',
        rainBackup: 'Se chover: Os Museus Capitolinos possuem galerias subterrâneas incríveis que ligam os palácios do Capitólio.',
        activities: [
          { 
            time: '08:30', 
            title: 'Café da Manhã no Caffè del Cappuccino', 
            category: 'Gastronomia Italiana', 
            location: 'Via dei Fori Imperiali, Roma', 
            duration: '0h 45min', 
            cost: '€4,50',
            transit: '🚇 Metrô Linha B (Estação Colosseo)',
            tip: 'Comece a manhã com um cornetto fresco e cappuccino tradicional antes de entrar no Coliseu.'
          },
          { 
            time: '09:30', 
            title: 'Coliseu Romano (Acesso à Arena & Arquibancadas)', 
            category: 'História Imperial', 
            location: 'Piazza del Colosseo, 1', 
            duration: '2h 00min', 
            cost: '€18,00',
            transit: '🚶 2 min a pé saindo do café',
            tip: 'Entrada com horário rígido. Entre pelo Portão Stern para evitar a fila da bilheteria comum.'
          },
          { 
            time: '11:45', 
            title: 'Fórum Romano & Monte Palatino', 
            category: 'História & Ruínas', 
            location: 'Via di San Gregorio, 30', 
            duration: '1h 45min', 
            cost: 'Incluso no bilhete do Coliseu',
            transit: '🚶 Entrada a 100m da saída do Coliseu',
            tip: 'Suba ao topo da Colina do Palatino para visualizar a maquete natural das ruínas e a antiga residência dos imperadores.'
          },
          { 
            time: '13:45', 
            title: 'Almoço na Trattoria Luzzi ou Osteria da Fortunata', 
            category: 'Gastronomia Romana', 
            location: 'Via de\' SS. Quattro, 36', 
            duration: '1h 30min', 
            cost: '€22,00',
            transit: '🚶 6 min de caminhada saindo do Fórum',
            tip: 'Peça a tradicional Pasta Carbonara feita com Guanciale crocante, gema de ovo e queijo Pecorino Romano.'
          },
          { 
            time: '15:45', 
            title: 'Altare della Patria (Monumento a Vittorio Emanuele II)', 
            category: 'Arquitetura', 
            location: 'Piazza Venezia', 
            duration: '1h 15min', 
            cost: 'Terraço Elevador: €12,00',
            transit: '🚶 10 min a pé pela Via dei Fori Imperiali',
            tip: 'Pegue o elevador de vidro panorâmico (Terrazza delle Quadrighe) para a vista mais alta do horizonte romano.'
          }
        ]
      },
      {
        dayNumber: 2,
        title: 'Dia 2: Estado do Vaticano, Capela Sistina & Bairro Prati',
        summary: 'Arte renascentista nos Museus do Vaticano, a grandiosidade de São Pedro e a melhor pizza fatiada de Roma.',
        dailyTransport: '🚇 Metrô Linha A (Estação Ottaviano) + 🚶 Caminhada leve',
        rainBackup: 'Se chover: O circuito dos Museus do Vaticano é 100% coberto em galerias climatizadas.',
        activities: [
          { 
            time: '08:30', 
            title: 'Museus do Vaticano & Capela Sistina', 
            category: 'Arte Sacra', 
            location: 'Viale Vaticano', 
            duration: '3h 30min', 
            cost: '€25,00',
            transit: '🚇 Metrô Linha A (Estação Ottaviano - 8 min a pé)',
            tip: 'Reserve o 1º horário da manhã. Admire as Salas de Rafael antes da multidão e respeite o silêncio na Capela Sistina.'
          },
          { 
            time: '12:15', 
            title: 'Basílica de São Pedro & Subida à Cúpula', 
            category: 'Arquitetura & Fé', 
            location: 'Piazza San Pietro', 
            duration: '1h 45min', 
            cost: 'Entrada Basílica: Grátis | Cúpula: €10,00',
            transit: '🚶 Corredor de ligação direto dos Museus',
            tip: 'Suba até o topo do domo desenhado por Michelangelo para contemplar a praça em formato de chave.'
          },
          { 
            time: '14:15', 
            title: 'Almoço no Bonci Pizzarium (Pizza al Taglio)', 
            category: 'Gastronomia Prática', 
            location: 'Via della Meloria, 43 (Bairro Prati)', 
            duration: '1h 00min', 
            cost: '€12,00',
            transit: '🚶 10 min a pé saindo da Praça de São Pedro',
            tip: 'O mestre Gabriele Bonci criou a pizza fatiada perfeita com massa de 72h de fermentação. Escolha sabores por peso.'
          },
          { 
            time: '15:45', 
            title: 'Castel Sant\'Angelo e Ponte dos Anjos', 
            category: 'História & Fortaleza', 
            location: 'Lungotevere Castello, 50', 
            duration: '1h 30min', 
            cost: '€15,00',
            transit: '🚶 Caminhada reto pela Via della Conciliazione',
            tip: 'Fortaleza histórica às margens do Rio Tibre. A ponte decorada com esculturas de anjos por Bernini é mágica no pôr do sol.'
          }
        ]
      },
      {
        dayNumber: 3,
        title: 'Dia 3: Centro Histórico, Fontes e Praças Românticas',
        summary: 'Passeio a pé pelos cartões-postais da Fontana di Trevi, Panteão e Piazza Navona.',
        dailyTransport: '🚶 Circuito 100% a pé no centro histórico de Roma',
        rainBackup: 'Se chover: O Panteão proporciona um espetáculo raro quando as gotas caem pelo oculus do teto.',
        activities: [
          { 
            time: '09:00', 
            title: 'Piazza di Spagna & Escadaria de Trinità dei Monti', 
            category: 'Cultura', 
            location: 'Piazza di Spagna', 
            duration: '1h 00min', 
            cost: 'Gratuito',
            transit: '🚇 Metrô Linha A (Estação Spagna)',
            tip: 'Chegue cedo para apreciar a Fonte da Barcaccia e a escadaria sem aglomerações.'
          },
          { 
            time: '10:30', 
            title: 'Fontana di Trevi', 
            category: 'Tradição Barroca', 
            location: 'Piazza di Trevi', 
            duration: '1h 00min', 
            cost: 'Gratuito',
            transit: '🚶 8 min a pé pela Via delle Muratte',
            tip: 'Jogue uma moeda de costas para garantir sua volta à Cidade Eterna.'
          },
          { 
            time: '12:00', 
            title: 'Panteão de Roma (Pantheon de Agripa)', 
            category: 'Engenharia Antiga', 
            location: 'Piazza della Rotonda', 
            duration: '1h 00min', 
            cost: '€5,00',
            transit: '🚶 6 min a pé a partir da Fontana di Trevi',
            tip: 'O edifício mais bem preservado da antiguidade. Visite o túmulo do mestre renascentista Rafael.'
          },
          { 
            time: '13:30', 
            title: 'Almoço na Cantina e Cucina (Piazza Navona)', 
            category: 'Gastronomia Romana', 
            location: 'Via del Governo Vecchio, 87', 
            duration: '1h 30min', 
            cost: '€24,00',
            transit: '🚶 4 min a pé atravessando a Piazza Navona',
            tip: 'Experimente a Suppli (bolinho romano de arroz com mozzarella derretida) e sorvete de pistache na Giolitti.'
          }
        ]
      },
      {
        dayNumber: 4,
        title: 'Dia 4: O Bairro Boêmio de Trastevere & Mirante do Gianicolo',
        summary: 'Ruas floridas com heras, fontes medievais e o melhor da culinária romana autêntica.',
        dailyTransport: '🚌 Bonde/Tram 8 de Largo Argentina para Trastevere + 🚶 Caminhada',
        rainBackup: 'Se chover: Aproveite o almoço longo em trattorias tradicionais acolhedoras.',
        activities: [
          { 
            time: '10:00', 
            title: 'Caminhada por Trastevere & Basílica de Santa Maria in Trastevere', 
            category: 'Cultura Local', 
            location: 'Piazza di Santa Maria in Trastevere', 
            duration: '2h 00min', 
            cost: 'Gratuito',
            transit: '🚶 Travessia a pé da Ponte Sisto',
            tip: 'Conheça uma das igrejas mais antigas de Roma adornada com mosaicos dourados do século XII.'
          },
          { 
            time: '12:30', 
            title: 'Almoço na Trattoria Tonnarello ou Grazia & Graziella', 
            category: 'Gastronomia Autêntica', 
            location: 'Via del Moro, 35', 
            duration: '2h 00min', 
            cost: '€20,00',
            transit: '🚶 3 min a pé da praça central',
            tip: 'Peça o famoso Tonnarello Cacio e Pepe servido na própria frigideira de alumínio.'
          },
          { 
            time: '15:30', 
            title: 'Mirante da Colina do Gianicolo (Piazzale Garibaldi)', 
            category: 'Vista Panorâmica', 
            location: 'Piazzale Garibaldi', 
            duration: '1h 30min', 
            cost: 'Gratuito',
            transit: '🚶 Subida de 15 min pela Via Garibaldi',
            tip: 'O ponto de observação mais elevado da cidade com vista completa das cúpulas de Roma.'
          }
        ]
      },
      {
        dayNumber: 5,
        title: 'Dia 5: Arte Clássica na Galeria Borghese & Despedida',
        summary: 'Esculturas de Bernini, pinturas de Caravaggio e passeios nos jardins de Villa Borghese.',
        dailyTransport: '🚌 Ônibus 160/61 para Villa Borghese ou Metrô Linha A (Estação Flaminio)',
        rainBackup: 'Se chover: A Galeria Borghese é totalmente abrigada.',
        activities: [
          { 
            time: '09:00', 
            title: 'Galeria Borghese (Obras de Bernini & Caravaggio)', 
            category: 'Arte & Escultura', 
            location: 'Piazzale Scipione Borghese, 5', 
            duration: '2h 00min', 
            cost: '€15,00 (Reserva Obrigatória)',
            transit: '🚌 Ônibus 160 até o parque',
            tip: 'Admire os detalhes em mármore da escultura "Apolo e Dafne" por Bernini.'
          },
          { 
            time: '11:30', 
            title: 'Jardins de Villa Borghese & Mirante do Pincio', 
            category: 'Natureza', 
            location: 'Viale del Muro Torto', 
            duration: '1h 30min', 
            cost: 'Gratuito',
            transit: '🚶 Caminhada pelo parque',
            tip: 'Caminhe até o Terrazza del Pincio para admirar a Piazza del Popolo do alto.'
          },
          { 
            time: '13:30', 
            title: 'Almoço e Compras no Mercado de Campo de\' Fiori', 
            category: 'Gastronomia & Compras', 
            location: 'Piazza Campo de\' Fiori', 
            duration: '2h 00min', 
            cost: '€22,00',
            transit: '🚌 Ônibus 62 até o centro histórico',
            tip: 'Compre azeites de oliva com trufas e massas coloridas artesanais para levar na mala.'
          }
        ]
      }
    ]
  },
  'nova-york': {
    destination: 'Nova York',
    durationDays: 7,
    title: 'Roteiro de 7 Dias em Nova York: O Guia Definitivo por Bairros e Atrações',
    description: 'Um itinerário completo e denso para Nova York. Otimizado por regiões para economizar tempo no metrô, economizar com o passe ilimitado e aproveitar o melhor de Manhattan e Brooklyn.',
    budgetEstimate: 'R$ 680 / dia por pessoa',
    bestSeason: 'Setembro a Novembro (Outono) ou Abril a Maio (Primavera)',
    readinessScore: 9,
    readinessTotal: 9,
    copilotInsight: 'Compre o cartão MetroCard de 7 dias Ilimitado ($34 USD) para andar livremente de metrô e ônibus. Alterne atrações de observatórios pagos (SUMMIT ou Top of the Rock) com passeios gratuitos nos parques e pontes.',
    itinerary: [
      {
        dayNumber: 1,
        title: 'Dia 1: Midtown Manhattan, Quinta Avenida & Times Square',
        summary: 'Chegada triunfal ao coração dos arranha-céus e luzes de Manhattan.',
        dailyTransport: '🚶 Caminhada de 3km em Midtown + Metrô Linhas N/Q/R/W',
        rainBackup: 'Se chover: A Biblioteca de NY e a Estação Grand Central são monumentos abrigados.',
        activities: [
          { time: '08:30', title: 'Café da Manhã na Best Bagel & Coffee', category: 'Gastronomia Tradicional', location: '225 W 35th St', duration: '0h 45min', cost: '$12 USD', transit: '🚇 Metrô Linha 1/2/3 (Estação 34 St-Penn)', tip: 'Experimente o clássico bagel nova-iorquino com Cream Cheese e Lox (salmão curado).' },
          { time: '09:30', title: 'Catedral de São Patrício & 5ª Avenida', category: 'Arquitetura', location: '5th Ave & 50th St', duration: '1h 15min', cost: 'Gratuito', transit: '🚶 10 min a pé subindo a 5ª Avenida', tip: 'Catedral gótica cercada por torres espelhadas.' },
          { time: '11:00', title: 'Observatório Top of the Rock', category: 'Vista Panorâmica', location: '30 Rockefeller Plaza', duration: '2h 00min', cost: '$40 USD', transit: '🚶 No próprio Rockefeller Center', tip: 'A vista panorâmica frontal perfeita do Empire State Building e do Central Park.' },
          { time: '13:30', title: 'Almoço na Grand Central Terminal (Grand Central Oyster Bar)', category: 'Gastronomia', location: '89 E 42nd St', duration: '1h 30min', cost: '$25 USD', transit: '🚶 10 min a pé pela 42nd St', tip: 'Admire o teto celestial azul com constelações pintadas em ouro.' },
          { time: '15:30', title: 'Biblioteca Pública de NY & Bryant Park', category: 'Cultura', location: '476 5th Ave', duration: '1h 30min', cost: 'Gratuito', transit: '🚶 5 min a pé', tip: 'Conheça a Rose Main Reading Room e desfrute das cadeiras verdes no gramado.' },
          { time: '19:00', title: 'Times Square & Jantar no Junior\'s Cheesecake', category: 'Vida Noturna', location: 'Broadway & 45th St', duration: '2h 00min', cost: '$28 USD', transit: '🚶 8 min a pé', tip: 'Os painéis luminosos ganham vida ao anoitecer. Experimente o clássico cheesecake de NY.' }
        ]
      },
      {
        dayNumber: 2,
        title: 'Dia 2: Central Park & Museus de Nível Mundial',
        summary: 'Arte universal e natureza no pulmão verde de Nova York.',
        dailyTransport: '🚶 Caminhada de 4km no parque + Metrô Linhas 4/5/6',
        rainBackup: 'Se chover: O Museu MET possui mais de 2 milhões de obras em galerias totalmente cobertas.',
        activities: [
          { time: '09:00', title: 'Central Park (Strawberry Fields, Bethesda & Bow Bridge)', category: 'Natureza', location: 'Central Park', duration: '2h 30min', cost: 'Gratuito', transit: '🚇 Metrô Linhas B/C (Estação 72 St)', tip: 'Visite o mosaico "Imagine" em memória a John Lennon e a fonte da Bethesda.' },
          { time: '12:00', title: 'Metropolitan Museum of Art (The MET)', category: 'Arte Mundial', location: '1000 5th Ave', duration: '3h 30min', cost: '$30 USD', transit: '🚶 Saída direta do parque para a 5ª Avenida', tip: 'Não perca a ala do Egito Antigo (Templo de Dendur) e a galeria de armaduras medievais.' },
          { time: '16:00', title: 'Cookies na Levain Bakery (Upper West Side)', category: 'Gastronomia', location: '167 W 74th St', duration: '1h 00min', cost: '$8 USD', transit: '🚶 Atravessando o parque a pé', tip: 'O cookie gigante de 170g mais famoso da cidade. Sabores de choco-chips e nozes.' }
        ]
      },
      {
        dayNumber: 3,
        title: 'Dia 3: Estátua da Liberdade, Financial District & 9/11 Memorial',
        summary: 'História dos imigrantes, o centro financeiro de Wall Street e homenagem emocionante.',
        dailyTransport: '🚇 Metrô Linha 1 (Estação South Ferry) + Ferry oficial',
        rainBackup: 'Se chover: O Museu do 11 de Setembro e a estação Oculus são abrigados.',
        activities: [
          { time: '08:30', title: 'Ferry para a Estátua da Liberdade & Ellis Island', category: 'História', location: 'Battery Park', duration: '3h 30min', cost: '$24 USD', transit: '🚇 Metrô Linha 1 para South Ferry', tip: 'Embarque no primeiro ferry da Statue City Cruises para evitar grandes filas.' },
          { time: '13:00', title: 'Wall Street & Touro de Bronze (Charging Bull)', category: 'Cultura', location: 'Wall St & Broad St', duration: '1h 30min', cost: 'Gratuito', transit: '🚶 10 min a pé saindo do Battery Park', tip: 'Tire a foto tradicional com a escultura do touro e a fachada da Bolsa de Valores.' },
          { time: '15:00', title: '9/11 Memorial & Museu do 11 de Setembro', category: 'História', location: '180 Greenwich St', duration: '2h 30min', cost: '$29 USD', transit: '🚶 8 min a pé', tip: 'Espelhos d\'água marcando a base das antigas Torres Gêmeas.' }
        ]
      },
      {
        dayNumber: 4,
        title: 'Dia 4: Travessia da Ponte do Brooklyn & DUMBO',
        summary: 'Caminhada icônica e o cenário mais fotogênico sobre o East River.',
        dailyTransport: '🚶 Caminhada na ponte + Metrô Linha A/C (Estação High St)',
        rainBackup: 'Se chover: Almoce no Time Out Market Brooklyn sob pavilhão coberto.',
        activities: [
          { time: '09:30', title: 'Caminhada pela Ponte do Brooklyn', category: 'Passeio Icônico', location: 'Brooklyn Bridge Entry', duration: '1h 30min', cost: 'Gratuito', transit: '🚇 Metrô Linha 4/5/6 para Brooklyn Bridge-City Hall', tip: 'Caminhe pelo tablado de madeira apreciando os cabos de aço e o skyline de Manhattan.' },
          { time: '11:30', title: 'DUMBO & Foto da Washington Street', category: 'Fotografia', location: 'Washington St & Water St', duration: '1h 30min', cost: 'Gratuito', transit: '🚶 Saída direta da cabeceira da ponte', tip: 'A foto famosa enquadra a Ponte de Manhattan entre edifícios de tijolos vermelhos.' },
          { time: '13:30', title: 'Almoço no Time Out Market Brooklyn ou Grimaldi\'s Pizza', category: 'Gastronomia', location: '55 Water St', duration: '1h 30min', cost: '$22 USD', transit: '🚶 3 min a pé', tip: 'O terraço no 5º andar do Time Out Market oferece vista espetacular para a ponte.' }
        ]
      },
      {
        dayNumber: 5,
        title: 'Dia 5: High Line Park, Hudson Yards & Chelsea Market',
        summary: 'Design urbano inovador, gastronomia e o futurista The Vessel.',
        dailyTransport: '🚇 Metrô Linha 7 (Estação 34 St - Hudson Yards)',
        rainBackup: 'Se chover: O Chelsea Market é um mercado gastronômico 100% coberto.',
        activities: [
          { time: '10:00', title: 'High Line Park (Trilhos Suspensos)', category: 'Urbanismo', location: 'Gansevoort St to 34th St', duration: '1h 30min', cost: 'Gratuito', transit: '🚇 Metrô Linha A/C/E para 14th St', tip: 'Antiga linha de trem elevada convertida em parque linear botânico com obras de arte.' },
          { time: '12:00', title: 'Almoço no Chelsea Market (Lobster Place ou Los Tacos No. 1)', category: 'Gastronomia', location: '75 9th Ave', duration: '1h 30min', cost: '$20 USD', transit: '🚶 Descida na altura da 15th St', tip: 'Peça os tacos mexicanos autênticos ou o roll de lagosta fresca.' },
          { time: '14:30', title: 'Hudson Yards & Estrutura The Vessel', category: 'Arquitetura', location: '20 Hudson Yards', duration: '1h 30min', cost: 'Gratuito', transit: '🚶 Caminhada até o extremo norte do High Line', tip: 'Estrutura metálica futurista em forma de colmeia e shopping conceitual.' }
        ]
      },
      {
        dayNumber: 6,
        title: 'Dia 6: SoHo, Greenwich Village & Compras',
        summary: 'Ruas históricas de paralelepípedos, moda e espírito boêmio.',
        dailyTransport: '🚇 Metrô Linha N/R (Estação Prince St)',
        rainBackup: 'Se chover: Visite a galeria de arte contemporânea New Museum no Bowery.',
        activities: [
          { time: '10:00', title: 'Compras no SoHo & Arquitetura de Ferro Fundido', category: 'Compras', location: 'Broadway & Prince St', duration: '2h 30min', cost: 'Gratuito', transit: '🚇 Metrô Linha N/R (Estação Prince St)', tip: 'Edifícios históricos de Cast-Iron e boutiques de moda conceituais.' },
          { time: '13:00', title: 'Fatia de Pizza na Joe\'s Pizza (Greenwich Village)', category: 'Gastronomia Tradicional', location: '7 Carmine St', duration: '1h 00min', cost: '$4 USD', transit: '🚶 10 min a pé em direção ao Village', tip: 'A fatia nova-iorquina autêntica de massa fina e molho de tomate fresco.' },
          { time: '15:00', title: 'Washington Square Park', category: 'Cultura', location: 'Washington Square', duration: '2h 00min', cost: 'Gratuito', transit: '🚶 5 min a pé', tip: 'O arco de triunfo de mármore e apresentações de músicos de jazz ao ar livre.' }
        ]
      },
      {
        dayNumber: 7,
        title: 'Dia 7: Observatório SUMMIT One Vanderbilt & Musical da Broadway',
        summary: 'Despedida inesquecível no observatório de espelhos e no teatro clássico.',
        dailyTransport: '🚇 Metrô Linhas 4/5/6/7 para Grand Central',
        rainBackup: 'Se chover: Experiências totalmente abrigadas.',
        activities: [
          { time: '10:00', title: 'Observatório SUMMIT One Vanderbilt', category: 'Imersão & Vista', location: '45 E 42nd St', duration: '2h 30min', cost: '$43 USD', transit: '🚇 Saída interna direta da Grand Central Terminal', tip: 'Salas de espelhos flutuantes no 91º andar com ilusão de ótica e tecnologia pura.' },
          { time: '14:00', title: 'Ingressos TKTS (Times Square)', category: 'Teatro', location: 'Broadway & 47th St', duration: '1h 00min', cost: '$80 USD', transit: '🚶 10 min a pé pela 42nd St', tip: 'Compre ingressos para musicais da Broadway no mesmo dia com até 50% de desconto.' },
          { time: '19:00', title: 'Show da Broadway (O Rei Leão, Wicked ou Aladdin)', category: 'Espetáculo', location: 'Theater District', duration: '2h 30min', cost: 'Incluso no bilhete', transit: '🚶 Caminhada até o teatro correspondente', tip: 'A maior experiência teatral e de entretenimento do mundo.' }
        ]
      }
    ]
  }
};

module.exports = async function handler(req, res) {
  const destinationQuery = (req.query.destination || 'buenos-aires').toLowerCase();
  const destKey = slugify(destinationQuery);
  const routeData = RICH_DESTINATIONS[destKey] || RICH_DESTINATIONS['buenos-aires'];

  const indexValidation = validateIndexationCriteria(routeData);
  const structuredData = generateSeoStructuredData(routeData);
  const ctaUrl = buildCloneCtaUrl(routeData);

  const metaRobots = indexValidation.shouldIndex ? 'index, follow' : 'noindex, follow';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${routeData.title} | Orbia Travel — Seu Copiloto de Viagem</title>
  <meta name="description" content="${routeData.description}">
  <meta name="robots" content="${metaRobots}">
  <link rel="canonical" href="https://copilotodeviagem.com.br${buildSeoRoutePath(routeData.destination, routeData.durationDays)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Sora:wght@600;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  
  <style>
    :root {
      --bg: #F7F5F0;
      --surface: #FFFFFF;
      --surface-raised: #FCFBF8;
      --sidebar: #111827;
      --text-main: #111827;
      --text-secondary: #334155;
      --text-muted: #475569;
      --primary: #c85a32;
      --primary-hover: #a74523;
      --accent: #10b981;
      --border: rgba(17, 24, 39, 0.08);
      --shadow-sm: 0 2px 10px rgba(17, 24, 39, 0.04);
      --shadow-md: 0 8px 24px rgba(17, 24, 39, 0.06);
    }
    * { box-sizing: border-box; }
    body { 
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
      background: var(--bg); 
      color: var(--text-main); 
      margin: 0; 
      padding: 0; 
      line-height: 1.5; 
      -webkit-font-smoothing: antialiased;
    }
    
    /* Topbar */
    .topbar {
      position: sticky;
      top: 0;
      z-index: 100;
      background: rgba(255, 255, 255, 0.94);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .brand-link {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
    }
    .brand-logo {
      width: 38px;
      height: 38px;
      background: rgba(200, 90, 50, 0.12);
      border: 1px solid rgba(200, 90, 50, 0.25);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--primary);
      font-size: 1.1rem;
    }
    .brand-title {
      font-size: 1.05rem;
      font-weight: 800;
      color: var(--text-main);
      display: flex;
      flex-direction: column;
      line-height: 1.1;
    }
    .brand-subtitle {
      font-size: 0.68rem;
      color: var(--text-muted);
      font-weight: 600;
    }
    .topbar-btn {
      background: var(--primary);
      color: #FFFFFF;
      text-decoration: none;
      padding: 10px 20px;
      border-radius: 50px;
      font-size: 0.88rem;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: background 0.2s, transform 0.2s;
      box-shadow: 0 4px 14px rgba(200, 90, 50, 0.25);
    }
    .topbar-btn:hover {
      background: var(--primary-hover);
      transform: translateY(-1px);
    }

    /* Main Container */
    .layout-container {
      max-width: 1080px;
      margin: 0 auto;
      padding: 32px 20px 60px;
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: 32px;
      align-items: start;
    }

    /* Left Sidebar Card */
    .trip-summary-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 24px;
      box-shadow: var(--shadow-sm);
      position: sticky;
      top: 80px;
    }
    .summary-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #e6f4ea;
      color: #065f46;
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: 999px;
      padding: 4px 12px;
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 12px;
    }
    .trip-dest-title {
      font-size: 1.6rem;
      font-weight: 800;
      color: var(--text-main);
      margin: 0 0 6px;
      letter-spacing: -0.02em;
    }
    .trip-duration-label {
      font-size: 0.88rem;
      color: var(--text-muted);
      font-weight: 600;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .info-metric-box {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px;
      margin-bottom: 14px;
    }
    .info-metric-label {
      font-size: 0.7rem;
      text-transform: uppercase;
      font-weight: 700;
      color: var(--text-muted);
      letter-spacing: 0.05em;
      display: block;
      margin-bottom: 4px;
    }
    .info-metric-val {
      font-size: 0.95rem;
      font-weight: 800;
      color: var(--text-main);
    }

    .readiness-progress-wrapper {
      margin-top: 18px;
      padding-top: 18px;
      border-top: 1px dashed var(--border);
    }
    .readiness-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      font-size: 0.82rem;
      font-weight: 700;
    }
    .progress-bar-bg {
      background: rgba(17, 24, 39, 0.08);
      height: 8px;
      border-radius: 999px;
      overflow: hidden;
    }
    .progress-bar-fill {
      background: linear-gradient(90deg, var(--primary) 0%, var(--accent) 100%);
      height: 100%;
      border-radius: 999px;
    }

    .copilot-insight-box {
      background: rgba(200, 90, 50, 0.06);
      border: 1px solid rgba(200, 90, 50, 0.2);
      border-radius: 12px;
      padding: 14px;
      margin-top: 18px;
      font-size: 0.78rem;
      color: var(--text-secondary);
      line-height: 1.45;
    }
    .copilot-insight-title {
      font-weight: 800;
      color: var(--primary);
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
      font-size: 0.8rem;
    }

    /* Right Main Content */
    .timeline-header-title {
      font-size: 1.75rem;
      font-weight: 800;
      color: var(--text-main);
      margin: 0 0 6px;
      letter-spacing: -0.02em;
    }
    .timeline-header-desc {
      font-size: 0.98rem;
      color: var(--text-secondary);
      margin: 0 0 28px;
    }

    /* Day Card Container */
    .day-block {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 24px;
      margin-bottom: 28px;
      box-shadow: var(--shadow-sm);
    }
    .day-block-header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    .day-block-number {
      font-size: 0.75rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      background: rgba(200, 90, 50, 0.1);
      color: var(--primary);
      padding: 4px 10px;
      border-radius: 6px;
    }
    .day-block-title {
      font-size: 1.25rem;
      font-weight: 800;
      color: var(--text-main);
      margin: 6px 0 2px;
    }
    .day-block-summary {
      font-size: 0.84rem;
      color: var(--text-muted);
      display: block;
    }
    .day-transport-banner {
      margin-top: 10px;
      padding: 8px 12px;
      background: rgba(2, 132, 199, 0.06);
      border: 1px solid rgba(2, 132, 199, 0.18);
      border-radius: 8px;
      font-size: 0.76rem;
      color: #075985;
      font-weight: 600;
    }
    .day-rain-banner {
      margin-top: 6px;
      padding: 8px 12px;
      background: rgba(217, 119, 6, 0.06);
      border: 1px solid rgba(217, 119, 6, 0.18);
      border-radius: 8px;
      font-size: 0.76rem;
      color: #92400e;
      font-weight: 600;
    }

    /* Activity Items */
    .activity-timeline {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .activity-row {
      display: grid;
      grid-template-columns: 75px 1fr;
      gap: 16px;
      background: var(--surface-raised);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 18px;
    }
    .activity-time-badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--primary);
      background: rgba(200, 90, 50, 0.08);
      border: 1px solid rgba(200, 90, 50, 0.18);
      border-radius: 8px;
      padding: 6px 8px;
      text-align: center;
      height: fit-content;
    }
    .activity-main-info {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .activity-top-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .activity-cat-chip {
      font-size: 0.68rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      background: rgba(17, 24, 39, 0.06);
      color: var(--text-main);
      padding: 3px 8px;
      border-radius: 4px;
    }
    .activity-duration-chip {
      font-size: 0.68rem;
      font-weight: 700;
      background: rgba(16, 185, 129, 0.1);
      color: #065f46;
      padding: 3px 8px;
      border-radius: 4px;
    }
    .activity-cost-chip {
      font-size: 0.68rem;
      font-weight: 700;
      background: rgba(200, 90, 50, 0.1);
      color: var(--primary);
      padding: 3px 8px;
      border-radius: 4px;
    }
    .activity-location {
      font-size: 0.74rem;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .activity-transit-tag {
      font-size: 0.74rem;
      color: #075985;
      background: #e0f2fe;
      padding: 4px 8px;
      border-radius: 6px;
      font-weight: 600;
    }
    .activity-title {
      font-size: 1.05rem;
      font-weight: 800;
      color: var(--text-main);
      margin: 0;
      line-height: 1.35;
    }
    .activity-tip {
      font-size: 0.8rem;
      color: var(--text-secondary);
      background: #FFFFFF;
      border: 1px solid rgba(17, 24, 39, 0.08);
      border-left: 4px solid var(--accent);
      border-radius: 8px;
      padding: 10px 14px;
      margin-top: 4px;
      line-height: 1.45;
    }

    /* Dynamic Reactive Banner */
    .reactive-feature-card {
      background: linear-gradient(135deg, #111827 0%, #1f2937 100%);
      color: #F8FAFC;
      border-radius: 20px;
      padding: 28px;
      margin-top: 36px;
      box-shadow: var(--shadow-md);
    }
    .reactive-feature-card h3 {
      font-size: 1.35rem;
      font-weight: 800;
      margin: 0 0 8px;
      color: #FFFFFF;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .reactive-feature-card p {
      font-size: 0.88rem;
      color: #CBD5E1;
      line-height: 1.5;
      margin: 0 0 20px;
    }
    .reactive-pills-grid {
      display grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
    }
    .reactive-pill {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      padding: 12px 14px;
      font-size: 0.8rem;
      color: #E2E8F0;
    }
    .reactive-pill strong {
      display: block;
      color: #FDBA74;
      font-size: 0.85rem;
      margin-bottom: 2px;
    }

    /* Bottom Conversion CTA */
    .bottom-cta-banner {
      background: #FFFFFF;
      border: 2px solid var(--primary);
      border-radius: 24px;
      padding: 40px 32px;
      text-align: center;
      margin-top: 40px;
      box-shadow: 0 12px 40px rgba(200, 90, 50, 0.12);
    }
    .bottom-cta-banner h2 {
      font-size: 1.8rem;
      font-weight: 800;
      color: var(--text-main);
      margin: 0 0 10px;
      letter-spacing: -0.02em;
    }
    .bottom-cta-banner p {
      font-size: 1.02rem;
      color: var(--text-secondary);
      max-width: 580px;
      margin: 0 auto 24px;
    }
    .cta-main-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      background: var(--accent);
      color: #FFFFFF;
      text-decoration: none;
      padding: 16px 36px;
      border-radius: 50px;
      font-size: 1.15rem;
      font-weight: 800;
      box-shadow: 0 6px 20px rgba(16, 185, 129, 0.3);
      transition: transform 0.2s, background 0.2s;
    }
    .cta-main-btn:hover {
      background: #059669;
      transform: translateY(-2px);
    }

    /* Responsive */
    @media (max-width: 860px) {
      .layout-container { grid-template-columns: 1fr; gap: 24px; }
      .trip-summary-card { position: static; }
      .activity-row { grid-template-columns: 1fr; }
      .topbar { padding: 10px 16px; }
      .bottom-cta-banner { padding: 28px 20px; }
    }
  </style>

  ${structuredData.map(schema => `<script type="application/ld+json">${JSON.stringify(schema)}</script>`).join('\n  ')}
</head>
<body>
  <!-- Top Navigation Header -->
  <header class="topbar">
    <a href="/" class="brand-link">
      <div class="brand-logo"><i class="fa-solid fa-compass"></i></div>
      <div class="brand-title">
        CoPiloto de Viagem
        <span class="brand-subtitle">Roteiro Interativo & Inteligente</span>
      </div>
    </a>
    <a href="${ctaUrl}" class="topbar-btn">
      <i class="fa-solid fa-wand-magic-sparkles"></i> Personalizar este Roteiro
    </a>
  </header>

  <main class="layout-container">
    <!-- Left Sidebar: Trip Overview & Metrics -->
    <aside class="trip-summary-card">
      <div class="summary-badge">
        <i class="fa-solid fa-circle-check"></i> Roteiro Validador
      </div>
      <h1 class="trip-dest-title">${routeData.destination}</h1>
      <div class="trip-duration-label">
        <i class="fa-regular fa-calendar"></i> ${routeData.durationDays} Dias de Viagem
      </div>

      <div class="info-metric-box">
        <span class="info-metric-label">Custo Estimado Médio</span>
        <div class="info-metric-val">${routeData.budgetEstimate}</div>
      </div>

      <div class="info-metric-box">
        <span class="info-metric-label">Melhor Época para Ir</span>
        <div class="info-metric-val" style="font-size: 0.85rem; font-weight: 700;">${routeData.bestSeason}</div>
      </div>

      <div class="readiness-progress-wrapper">
        <div class="readiness-header">
          <span>Saúde da Viagem</span>
          <span>${routeData.readinessScore}/${routeData.readinessTotal} Itens</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${(routeData.readinessScore / routeData.readinessTotal) * 100}%;"></div>
        </div>
      </div>

      <div class="copilot-insight-box">
        <div class="copilot-insight-title">
          <i class="fa-solid fa-lightbulb"></i> Dica do CoPiloto
        </div>
        ${routeData.copilotInsight}
      </div>
    </aside>

    <!-- Right Main Content: Daily Timeline & Activities -->
    <section class="timeline-main">
      <h2 class="timeline-header-title">${routeData.title}</h2>
      <p class="timeline-header-desc">${routeData.description}</p>

      <div class="days-wrapper">
        ${routeData.itinerary.map(day => `
          <article class="day-block">
            <header class="day-block-header">
              <div>
                <span class="day-block-number">DIA ${day.dayNumber}</span>
                <h3 class="day-block-title">${day.title}</h3>
                <span class="day-block-summary">${day.summary}</span>
                ${day.dailyTransport ? `<div class="day-transport-banner"><i class="fa-solid fa-route"></i> <strong>Logística do Dia:</strong> ${day.dailyTransport}</div>` : ''}
                ${day.rainBackup ? `<div class="day-rain-banner"><i class="fa-solid fa-cloud-rain"></i> <strong>Plano B (Chuva):</strong> ${day.rainBackup}</div>` : ''}
              </div>
            </header>

            <div class="activity-timeline">
              ${day.activities.map(act => `
                <div class="activity-row">
                  <div class="activity-time-badge">${act.time || '09:00'}</div>
                  <div class="activity-main-info">
                    <div class="activity-top-meta">
                      <span class="activity-cat-chip">${act.category || 'Atração'}</span>
                      ${act.duration ? `<span class="activity-duration-chip"><i class="fa-regular fa-clock"></i> ${act.duration}</span>` : ''}
                      ${act.cost ? `<span class="activity-cost-chip"><i class="fa-solid fa-tag"></i> ${act.cost}</span>` : ''}
                      <span class="activity-location"><i class="fa-solid fa-location-dot"></i> ${act.location}</span>
                    </div>
                    ${act.transit ? `<div class="activity-transit-tag"><i class="fa-solid fa-diamond-turn-right"></i> ${act.transit}</div>` : ''}
                    <h4 class="activity-title">${act.title}</h4>
                    ${act.tip ? `<div class="activity-tip">💡 <strong>Dica Prática do CoPiloto:</strong> ${act.tip}</div>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </article>
        `).join('')}
      </div>

      <!-- Reactive Dynamic Re-planning Feature -->
      <section class="reactive-feature-card">
        <h3><i class="fa-solid fa-cloud-sun-rain"></i> A viagem muda? O CoPiloto reorganiza.</h3>
        <p>Se o voo atrasar, chover no dia do passeio ao ar livre ou uma atração fechar, você não precisa replanejar do zero. O CoPiloto adapta os horários em tempo real.</p>
        <div class="reactive-pills-grid">
          <div class="reactive-pill">
            <strong>🌧️ Mudança de Clima</strong>
            Troca passeios em parques por museus e atrações cobertas.
          </div>
          <div class="reactive-pill">
            <strong>⏱️ Atraso de Transporte</strong>
            Recalcula os horários de chegada e sugere opções de rotas mais rápidas.
          </div>
        </div>
      </section>

      <!-- Bottom Conversion CTA -->
      <section class="bottom-cta-banner">
        <h2>Leve este Roteiro de ${routeData.destination} no Seu Celular</h2>
        <p>Personalize os dias, adicione suas reservas de voos e hotéis e tenha acompanhamento inteligente durante toda a viagem.</p>
        <a href="${ctaUrl}" class="cta-main-btn">
          ✨ Abrir e Personalizar Roteiro no CoPiloto
        </a>
      </section>
    </section>
  </main>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (typeof res.send === 'function') {
    res.status(200).send(html);
  } else {
    res.statusCode = 200;
    res.end(html);
  }
};
