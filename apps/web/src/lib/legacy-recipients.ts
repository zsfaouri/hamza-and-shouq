import type { Contact } from "./types";

export type LegacyRecipient = {
  name: string;
  phone: string;
  token?: string;
};

export const legacyRecipients: LegacyRecipient[] = [
  { name: "عطوفة اكثم المجالي و عائلته", phone: "796802802", token: "DWvMGRZ8" },
  { name: "المهندس أنس الذنبيات و عقيلته", phone: "795432210", token: "fjDZh3dq" },
  { name: "الدكتور حسن المجالي و عقيلته", phone: "798994500", token: "TzJv7umt" },
  { name: "الاستاذ محمد الختاتنة و عقيلته", phone: "792100099", token: "QujgqkE3" },
  { name: "الدكتور محمد المجالي و عقيلته", phone: "796999924", token: "rv6T2utG" },
  { name: "السيد احمد المجالي و عقيلته", phone: "796555512", token: "HQRbNwAh" },
  { name: "السيد اكرم بيك المجالي و عائلته", phone: "796660555", token: "CqxBky2U" },
  { name: "عطوفة فاروق المجالي و عائلته", phone: "799050675", token: "NCTsdZ2j" },
  { name: "الاستاذ محمد المجالي و عائلته", phone: "795309749", token: "nYnEVSxT" },
  { name: "الدكتور مراد ابو جابر و عقيلته", phone: "796906642", token: "pkyxVCny" },
  { name: "السيد عدي المجالي و عقيلته", phone: "790454020", token: "GCwnTBfg" },
  { name: "السيد حسام المجالي و عائلته", phone: "795363811", token: "aNyY7wEs" },
  { name: "السيد محمود المجالي و عقيلته", phone: "799815053", token: "Z8f7zeaY" },
  { name: "السيد محمد عبدالرحيم المجالي وعقيلته", phone: "797370407", token: "Me7SNRsj" },
  { name: "السيد فيصل المجالي و عقيلته", phone: "799627661", token: "nHCbnGqG" },
  { name: "السيد علي المجالي و عقيلته", phone: "797308819", token: "eRwyWzQV" },
  { name: "السيد حسين المجالي", phone: "787198186", token: "aQJM72Xv" },
  { name: "السيدة صباح المجالي", phone: "797895508", token: "vArarasK" },
  { name: "السيد سالم جديتاوي و عقيلته", phone: "799589753", token: "NuADh7zE" },
  { name: "السيد حازم المجالي و عقيلته", phone: "795000584", token: "66fgFaWe" },
  { name: "السيد محمد المجالي و عقيلته", phone: "798271796", token: "6FTtmtMq" },
  { name: "السيد معين المجالي و عقيلته", phone: "790718777", token: "qB6sfCve" },
  { name: "الدكتور زيد العدوان و عقيلته", phone: "795339496", token: "XjCAckM9" },
  { name: "الاستاذ عبدالله المجالي و عقيلته", phone: "795180699", token: "wajmKKGK" },
  { name: "حرم المرحوم عبد المهدي المجالي", phone: "791366418", token: "fEr3SCvr" },
  { name: "السيد حاكم المجالي و عائلته", phone: "799867390", token: "gX5ng8hB" },
  { name: "السيد عمرو الصغير و عقيلته", phone: "799418947", token: "p4M8nMun" },
  { name: "السيد ناظم المجالي و عائلته", phone: "795506239", token: "NV3nTxJY" },
  { name: "السيد حسام التكروري و عقيلته", phone: "0790344602", token: "j4VPnW2p" },
  { name: "السيد عاطف المجالي و عائلته", phone: "795784971", token: "jjBBbFx3" },
  { name: "السيد امجد المجالي و عقيلته", phone: "796950481", token: "JWJhkPzJ" },
  { name: "السيد فهد المجالي و عقيلته", phone: "796121659", token: "PUTT5e3H" },
  { name: "السيد سعود المجالي و عقيلته", phone: "796067106", token: "ZByxNRhe" },
  { name: "السيد خالد المجالي و عائلته", phone: "796819999", token: "ZJGcpcfC" },
  { name: "السيد راتب المجالي و عائلته", phone: "795505145", token: "2JRmrrt2" },
  { name: "السيد ياسين المجالي و عائلته", phone: "796177996", token: "FDM7JgAU" },
  { name: "المهندس حارث المقدادي و عقيلته", phone: "786661999", token: "uJd97Gut" },
  { name: "السيد طارق المعايطة و عقيلته", phone: "796111617", token: "Sj6T5JuJ" },
  { name: "حرم المرحوم سهم حابس المجالي", phone: "799295454", token: "EEXRRZnf" },
  { name: "السيد معاوية القرالة و عقيلته", phone: "0796339698", token: "UXd85vbn" },
  { name: "السيد سعد المجالي", phone: "799991962", token: "TCnshfJ9" },
  { name: "السيد بشار ابو حمور و عائلته", phone: "795502080", token: "pKPN4VJ6" },
  { name: "حرم المرحوم عبدالمجيد المجالي", phone: "795593331", token: "Ec9CWX94" },
  { name: "السيد ايمن المجالي و عقيلته", phone: "795924000", token: "SbFZx7xm" },
  { name: "عطوفة عبدالحي المجالي", phone: "795522522", token: "N8N9xDsF" },
  { name: "السيد عطالله المجالي", phone: "797310009", token: "gEFvgeBg" },
  { name: "السيد عيسى المجالي و عقيلته", phone: "795610999", token: "VB9hB5JQ" },
  { name: "الانسة نهى مصلح المجالي", phone: "796115137" },
  { name: "حرم المرحوم سالم المجالي", phone: "796966607", token: "2kTsFA42" },
  { name: "السيد طلال المجالي و عقيلته", phone: "799402402", token: "JybYzueR" },
  { name: "سعادة السيد عامر الكايد و عقيلته", phone: "", token: "aVqryfxc" },
];

export function normalizeJordanPhone(phone: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("962")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

export function findLegacyRecipientByPhone(phone: string) {
  const normalized = normalizeJordanPhone(phone);
  if (!normalized) return null;
  return legacyRecipients.find((recipient) => normalizeJordanPhone(recipient.phone) === normalized) || null;
}

export function findLegacyRecipientByToken(token: string) {
  const clean = token.trim();
  if (!clean) return null;
  return legacyRecipients.find((recipient) => recipient.token === clean) || null;
}

export function legacyRecipientContact(recipient: LegacyRecipient, token: string): Contact {
  const normalized = normalizeJordanPhone(recipient.phone);
  return {
    id: normalized ? `legacy-recovery-${normalized}` : `legacy-recovery-token-${token}`,
    name: recipient.name,
    phone: normalized ? `962${normalized}` : "",
    sourceTab: "legacy-recovery",
    fields: {
      recoveredToken: token,
    },
  };
}
