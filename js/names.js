(function (SINFORGE) {
  'use strict';
  // ---- Name generator: SINFORGE.names.generate(cfg) -> Promise<{ first, last, gender, src }>
  // cfg = S.names: { gender: 'any' | 'm' | 'f', region: <id in REGIONS>, title, key }.
  // Sources, in order of preference:
  //   1. Behind the Name (behindthename.com/api) — when the user has entered
  //      their own API key; every region maps to its usage codes.
  //   2. randomuser.me — keyless, for the real-world regions it covers (`ru`).
  //   3. built-in pools / syllable generators — fantasy + mythic, the regions
  //      randomuser lacks, and the offline fallback for everything.
  // gender 'any' is resolved to m / f up front, so the result always has one
  // (the TITLE slot follows it). Output is upper-cased and folded to Latin-1,
  // which the card font (Quantico) covers. ----

  const BTN = 'https://www.behindthename.com/api/random.json';
  const RU = 'https://randomuser.me/api/';
  const TIMEOUT = 6000;

  // id -> ru: randomuser nationalities | btn: Behind the Name usage codes |
  // pool: built-in pool key (else the anglo pool is the offline fallback)
  const REGIONS = {
    any:      { ru: ['us', 'gb', 'au', 'ca', 'ie', 'fr', 'de', 'es', 'mx', 'nl', 'dk', 'no', 'fi', 'br', 'tr', 'in'],
                btn: ['eng', 'usa', 'fre', 'ger', 'spa', 'ita', 'jap', 'chi', 'kor', 'rus', 'ara', 'swe', 'pol', 'dut', 'iri', 'por'] },
    anglo:    { ru: ['us', 'gb', 'au', 'ca', 'nz', 'ie'], btn: ['eng', 'usa', 'iri', 'sco'] },
    french:   { ru: ['fr'], btn: ['fre'] },
    german:   { ru: ['de', 'ch'], btn: ['ger'] },
    spanish:  { ru: ['es', 'mx'], btn: ['spa'] },
    italian:  { btn: ['ita'], pool: 'italian' },
    nordic:   { ru: ['dk', 'no', 'fi'], btn: ['swe', 'nor', 'dan', 'fin', 'ice'] },
    dutch:    { ru: ['nl'], btn: ['dut'] },
    slavic:   { btn: ['rus', 'ukr', 'pol', 'cze', 'ser'], pool: 'slavic' },
    turkish:  { ru: ['tr'], btn: ['tur'] },
    arabic:   { btn: ['ara'], pool: 'arabic' },
    indian:   { ru: ['in'], btn: ['ind', 'hin'] },
    japanese: { btn: ['jap'], pool: 'japanese' },
    chinese:  { btn: ['chi'], pool: 'chinese' },
    korean:   { btn: ['kor'], pool: 'korean' },
    brazil:   { ru: ['br'], btn: ['por'] },
    fantasy:  { btn: ['fntsr', 'fntso', 'fntss', 'fntst', 'fntsx'], pool: 'fantasy' },
    mythic:   { btn: ['gre-myth', 'sca-myth', 'cel-myth', 'egy-myth', 'sla-myth', 'rom-myth'], pool: 'mythic' },
  };
  const ORDER = Object.keys(REGIONS);

  // built-in pools: m / f first names + surnames (l), space-separated
  const split = (s) => s.split(' ');
  const POOLS = {
    anglo: { m: split('JACK LIAM NOAH ETHAN MASON LUCAS CALEB OWEN RYAN DECLAN MILES ROWAN VICTOR WADE'),
             f: split('AVA MAYA CHLOE NORA ELLA RUBY ZOE IVY HAZEL SADIE QUINN TESS VIOLET JUNE'),
             l: split('CARTER HAYES MORGAN REED BLAKE SHAW PRICE QUINN WARD COLE MERCER VANCE PIERCE STONE') },
    italian: { m: split('MARCO LUCA MATTEO GIULIO ENZO DARIO FABIO RICCARDO SERGIO VITTORIO NICOLA BRUNO'),
               f: split('GIULIA CHIARA SOFIA FRANCESCA ELENA MARTA BIANCA SERENA LUCIA ALESSIA NOEMI ROSA'),
               l: split('ROSSI RUSSO FERRARI ESPOSITO BIANCHI ROMANO COLOMBO RICCI MARINO GRECO BRUNO CONTI DE LUCA VITALE') },
    slavic: { m: split('IVAN DMITRI ALEKSEI NIKOLAI PAVEL OLEG YURI BORIS ANTON MAKSIM VIKTOR TOMASZ MILAN DUSAN'),
              f: split('ANNA OLGA IRINA NATALIA DARIA KSENIA VERA ZOYA MILENA ALINA YANA KATARINA VESNA LIDIA'),
              l: { m: split('VOLKOV SOKOLOV PETROV MOROZOV LEBEDEV KOZLOV ORLOV NOVAK KOVAC HORVAT PAVLOV ZAITSEV'),
                   f: split('VOLKOVA SOKOLOVA PETROVA MOROZOVA LEBEDEVA KOZLOVA ORLOVA NOVAK KOVAC HORVAT PAVLOVA ZAITSEVA') } },
    arabic: { m: split('OMAR KARIM TARIQ YUSUF SAMIR HASSAN ZAYED RASHID AMIR NABIL FARIS KHALID SALIM IBRAHIM'),
              f: split('LAYLA AMIRA NOOR YASMIN SALMA RANIA HANA ZAINAB MARIAM LEILA DALIA FARAH SAMIRA AISHA'),
              l: split('HADDAD MANSOUR KHALIL NASSER HAMDAN SALEH AZIZ RAHMAN FARAH QASIM BAKR AL-AMIN AL-SAYED HAMADI') },
    japanese: { m: split('KENJI HIRO TAKESHI RYO KAITO SHIN DAISUKE HARUTO REN YUTO KAZUKI SORA AKIRA JIN'),
                f: split('YUKI HANA AKANE MIKU RIN SAKURA AYAKA NAOMI EMI KAEDE MEI HARUKA AOI NANAMI'),
                l: split('TANAKA SATO SUZUKI WATANABE ITO YAMAMOTO NAKAMURA KOBAYASHI KATO YOSHIDA YAMADA SASAKI MORI ARASAKA') },
    chinese: { m: split('WEI JUN HAO LEI MING TAO JIAN BO YONG KAI CHEN FENG LONG ZHEN'),
               f: split('MEI LING XIU YAN HUI FANG JING LAN QING YING NA LI XIA SHU'),
               l: split('WANG LI ZHANG LIU CHEN YANG HUANG ZHAO WU ZHOU XU SUN MA ZHU') },
    korean: { m: split('MIN-JUN SEO-JUN JI-HO HYUN-WOO DO-YUN JUN-SEO TAE-YANG SUNG-MIN JAE-WON DONG-HYUN'),
              f: split('SEO-YEON JI-WOO HA-EUN MIN-SEO SU-AH YE-JIN SO-YEON JI-MIN HYE-JIN DA-EUN'),
              l: split('KIM LEE PARK CHOI JUNG KANG CHO YOON JANG LIM HAN SHIN SEO KWON') },
    mythic: { m: split('ODIN THOR LOKI TYR BALDR APOLLO ARES HERMES ANUBIS OSIRIS HORUS LUGH PERUN VELES MARS JANUS'),
              f: split('FREYA FRIGG SKADI HEL ATHENA ARTEMIS HERA SELENE ISIS BASTET SEKHMET BRIGID MORRIGAN DANU MOKOSH VESTA') },
  };
  // fantasy: syllable-built names; fantasy + mythic surnames: compound epithets
  const SYL = {
    start: split('AEL BAR CAEL DRA ELI FAE GAL ITH KOR LYS MOR NYX OR QUEL RHA SYL THAL VEY XAN ZER'),
    mid: ['A', 'E', 'I', 'O', 'RI', 'LA', 'NO', 'VE', 'DRA', '', ''],
    m: split('DOR RIC THAS MIR GORN ION VASH RAK DRIN KAR'),
    f: split('WYN RIA LITH SSA NAE IEL YRA ETH ELLE ARA'),
    ep1: split('STORM ASH IRON NIGHT SUN WOLF RAVEN FROST BLOOD STAR EMBER THORN SHADOW GOLD'),
    ep2: split('BORN WALKER BANE HEART SONG FORGE BLADE SHADE WARD MANE FALL WHISPER'),
  };

  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const fold = (s) => String(s || '').trim().toUpperCase()
    .replace(/[^\u0000-ÿ]/g, (ch) => ch.normalize('NFD').replace(/[̀-ͯ]/g, ''));

  function fantasyFirst(g) {
    let s = pick(SYL.start) + pick(SYL.mid) + pick(SYL[g]);
    return s.replace(/(.)\1\1/, '$1$1');
  }
  const epithet = () => pick(SYL.ep1) + pick(SYL.ep2);

  function local(regionId, g) {
    const r = REGIONS[regionId] || REGIONS.any;
    if (r.pool === 'fantasy') return { first: fantasyFirst(g), last: epithet() };
    const p = POOLS[r.pool] || POOLS.anglo;
    const last = !p.l ? epithet() : Array.isArray(p.l) ? pick(p.l) : pick(p.l[g]);
    return { first: pick(p[g]), last };
  }

  function getJson(url) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl && setTimeout(() => ctl.abort(), TIMEOUT);
    return fetch(url, { signal: ctl && ctl.signal, credentials: 'omit' })
      .then((r) => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .finally(() => clearTimeout(timer));
  }

  function fromBtn(r, g, key) {
    const q = new URLSearchParams({ key, gender: g, usage: pick(r.btn), number: '1', randomsurname: 'yes' });
    return getJson(`${BTN}?${q}`).then((d) => {
      if (d && d.error) { const e = new Error(d.error); e.btnKey = /key/i.test(d.error); throw e; }
      const n = (d && d.names) || [];
      if (!n.length) throw new Error('empty');
      // fantasy / mythic usages often have no surnames: fill with an epithet
      return { first: n[0], last: n.length > 1 ? n[n.length - 1] : epithet() };
    });
  }

  function fromRandomUser(r, g) {
    const q = new URLSearchParams({ inc: 'name', noinfo: '', gender: g === 'f' ? 'female' : 'male', nat: r.ru.join(',') });
    return getJson(`${RU}?${q}`).then((d) => {
      const n = d && d.results && d.results[0] && d.results[0].name;
      if (!n || !n.first) throw new Error('empty');
      return { first: n.first, last: n.last };
    });
  }

  // -> Promise<{ first, last, gender: 'm'|'f', src: 'btn'|'ru'|'local', fallback?: 'net'|'key' }>
  // (`fallback` says why a preferred source was skipped)
  function generate(cfg) {
    const g = cfg.gender === 'm' || cfg.gender === 'f' ? cfg.gender : pick(['m', 'f']);
    const id = REGIONS[cfg.region] ? cfg.region : 'any';
    const r = REGIONS[id];
    const key = String(cfg.key || '').trim();
    const done = (n, src, fallback) => ({ first: fold(n.first), last: fold(n.last), gender: g, src, fallback });
    // each step falls through to the next: BTN -> randomuser -> built-in
    const viaLocal = (why) => done(local(id, g), 'local', why);
    const viaRu = (why) => (r.ru ? fromRandomUser(r, g).then((n) => done(n, 'ru', why), () => viaLocal(why || 'net')) : viaLocal(why));
    if (key && r.btn) return fromBtn(r, g, key).then((n) => done(n, 'btn'), (e) => viaRu(e && e.btnKey ? 'key' : 'net'));
    return Promise.resolve(viaRu());
  }

  SINFORGE.names = { generate, regions: ORDER };
})(window.SINFORGE);
