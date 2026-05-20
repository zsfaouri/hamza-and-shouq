import type { Contact } from "./types";

export type LegacyRecipient = {
  name: string;
  phone: string;
};

export const legacyRecipients: LegacyRecipient[] = [
  { name: "عطوفة اكثم المجالي و عائلته", phone: "796802802" },
  { name: "المهندس أنس الذنبيات و عقيلته", phone: "795432210" },
  { name: "الدكتور حسن المجالي و عقيلته", phone: "798994500" },
  { name: "الاستاذ محمد الختاتنة و عقيلته", phone: "792100099" },
  { name: "الدكتور محمد المجالي و عقيلته", phone: "796999924" },
  { name: "السيد احمد المجالي و عقيلته", phone: "796555512" },
  { name: "السيد اكرم بيك المجالي و عائلته", phone: "796660555" },
  { name: "عطوفة فاروق المجالي و عائلته", phone: "799050675" },
  { name: "الاستاذ محمد المجالي و عائلته", phone: "795309749" },
  { name: "الدكتور مراد ابو جابر و عقيلته", phone: "796906642" },
  { name: "السيد عدي المجالي و عقيلته", phone: "790454020" },
  { name: "السيد حسام المجالي و عائلته", phone: "795363811" },
  { name: "السيد محمود المجالي و عقيلته", phone: "799815053" },
  { name: "السيد محمد عبدالرحيم المجالي وعقيلته", phone: "797370407" },
  { name: "السيد فيصل المجالي و عقيلته", phone: "799627661" },
  { name: "السيد علي المجالي و عقيلته", phone: "797308819" },
  { name: "السيد حسين المجالي", phone: "787198186" },
  { name: "السيدة صباح المجالي", phone: "797895508" },
  { name: "السيد سالم جديتاوي و عقيلته", phone: "799589753" },
  { name: "السيد حازم المجالي و عقيلته", phone: "795000584" },
  { name: "السيد محمد المجالي و عقيلته", phone: "798271796" },
  { name: "السيد معين المجالي و عقيلته", phone: "790718777" },
  { name: "الدكتور زيد العدوان و عقيلته", phone: "795339496" },
  { name: "الاستاذ عبدالله المجالي و عقيلته", phone: "795180699" },
  { name: "حرم المرحوم عبد المهدي المجالي", phone: "791366418" },
  { name: "السيد حاكم المجالي و عائلته", phone: "799867390" },
  { name: "السيد عمرو الصغير و عقيلته", phone: "799418947" },
  { name: "السيد ناظم المجالي و عائلته", phone: "795506239" },
  { name: "السيد حسام التكروري و عقيلته", phone: "0790344602" },
  { name: "السيد عاطف المجالي و عائلته", phone: "795784971" },
  { name: "السيد امجد المجالي و عقيلته", phone: "796950481" },
  { name: "السيد فهد المجالي و عقيلته", phone: "796121659" },
  { name: "السيد سعود المجالي و عقيلته", phone: "796067106" },
  { name: "السيد خالد المجالي و عائلته", phone: "796819999" },
  { name: "السيد راتب المجالي و عائلته", phone: "795505145" },
  { name: "السيد ياسين المجالي و عائلته", phone: "796177996" },
  { name: "المهندس حارث المقدادي و عقيلته", phone: "786661999" },
  { name: "السيد طارق المعايطة و عقيلته", phone: "796111617" },
  { name: "حرم المرحوم سهم حابس المجالي", phone: "799295454" },
  { name: "السيد معاوية القرالة و عقيلته", phone: "0796339698" },
  { name: "السيد سعد المجالي", phone: "799991962" },
  { name: "السيد بشار ابو حمور و عائلته", phone: "795502080" },
  { name: "حرم المرحوم عبدالمجيد المجالي", phone: "795593331" },
  { name: "السيد ايمن المجالي و عقيلته", phone: "795924000" },
  { name: "عطوفة عبدالحي المجالي", phone: "795522522" },
  { name: "السيد عطالله المجالي", phone: "797310009" },
  { name: "السيد عيسى المجالي و عقيلته", phone: "795610999" },
  { name: "الانسة نهى مصلح المجالي", phone: "796115137" },
  { name: "حرم المرحوم سالم المجالي", phone: "796966607" },
  { name: "السيد طلال المجالي و عقيلته", phone: "799402402" },
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

export function legacyRecipientContact(recipient: LegacyRecipient, token: string): Contact {
  const normalized = normalizeJordanPhone(recipient.phone);
  return {
    id: `legacy-recovery-${normalized}`,
    name: recipient.name,
    phone: `962${normalized}`,
    sourceTab: "legacy-recovery",
    fields: {
      recoveredToken: token,
    },
  };
}
