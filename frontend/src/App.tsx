import {
  AlertCircle,
  ArrowDownToLine,
  Banknote,
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ClipboardList,
  Copy,
  CreditCard,
  DollarSign,
  Edit3,
  Eye,
  FileImage,
  HelpCircle,
  Home,
  Link as LinkIcon,
  Loader2,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Trash2,
  UserRound,
  Users,
  WalletCards,
  X
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { api, exportUrl } from "./api";
import type {
  Charge,
  AuditLog,
  ChargeStatus,
  CashMovement,
  ContractItem,
  ContractReajustmentPreview,
  DashboardSummary,
  EmailInboxConfig,
  EmailImportRun,
  EmailSetupStatus,
  InvoiceScanResult,
  InvoiceDocument,
  InstitutionalReconciliation,
  CommissionIvaReportRow,
  OwnerCharge,
  OwnerBalanceReportRow,
  OwnerRentByDocumentReportRow,
  Person,
  PersonDetail,
  PaymentDetail,
  PropertyDetail,
  PropertyItem,
  PropertyVisit,
  PublicPortalData,
  Settlement,
  TenantCollectionReportRow,
  TenantCredit
} from "./types";

type View = "dashboard" | "charges" | "invoices" | "tenants" | "owners" | "properties" | "visits" | "contracts" | "payments" | "cash" | "settlements";
type AppModal =
  | "charge"
  | "payment"
  | "batchPayment"
  | "reminder"
  | "link"
  | "person"
  | "property"
  | "contract"
  | "reajustment"
  | "ownerCharge"
  | "freePayment"
  | "tenantDetail"
  | "propertyDetail"
  | "tenantCredit"
  | "ownerCredit"
  | "institutionalReconciliation"
  | null;

const navItems: Array<{ id: View; label: string; icon: typeof Home }> = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "charges", label: "Deudas", icon: ClipboardList },
  { id: "invoices", label: "Facturas", icon: FileImage },
  { id: "tenants", label: "Inquilinos", icon: UserRound },
  { id: "owners", label: "Propietarios", icon: Users },
  { id: "properties", label: "Propiedades", icon: Building2 },
  { id: "visits", label: "Visitas", icon: CalendarDays },
  { id: "contracts", label: "Contratos", icon: ReceiptText },
  { id: "payments", label: "Pagos", icon: Banknote },
  { id: "cash", label: "Caja", icon: DollarSign },
  { id: "settlements", label: "Liquidaciones", icon: WalletCards }
];

const statusMeta: Record<ChargeStatus, { label: string; className: string; dot: string }> = {
  pendiente: {
    label: "Pendiente",
    className: "bg-blue-50 text-blue-700 ring-blue-200",
    dot: "bg-blue-500"
  },
  parcial: {
    label: "Pago parcial",
    className: "bg-amber-50 text-amber-800 ring-amber-200",
    dot: "bg-amber-500"
  },
  pagado: {
    label: "Pagado",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    dot: "bg-emerald-500"
  },
  vencido: {
    label: "Vencido",
    className: "bg-rose-50 text-rose-700 ring-rose-200",
    dot: "bg-rose-500"
  }
};

const tenantConcepts = ["ALQUILER", "UTE", "OSE", "GASTOS_COMUNES", "TRIBUTOS", "SANEAMIENTO", "OTROS"];
const ownerConcepts = ["CONTRIBUCION", "PRIMARIA", "SANEAMIENTO", "OSE", "UTE", "FONDO_RESERVA", "TRIBUTOS", "ARREGLOS", "ANTEL", "SECURITAS", "OTROS"];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "UYU",
    maximumFractionDigits: 0
  }).format(value ?? 0);
}

function isBrouBankName(value: string) {
  const normalized = value.toLowerCase();
  return normalized.includes("brou") || normalized.includes("republica") || normalized.includes("república");
}

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function addMonthsToPeriod(period: string, offset: number) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, (month || 1) - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function periodDueDate(period: string, timing = "adelantado") {
  const duePeriod = timing === "vencido" ? addMonthsToPeriod(period, 1) : period;
  return `${duePeriod}-10`;
}

function rentPeriodForDuePeriod(duePeriod: string, timing = "adelantado") {
  return timing === "vencido" ? addMonthsToPeriod(duePeriod, -1) : duePeriod;
}

function formatIsoDate(value?: string | null) {
  if (!value) return "-";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

function formatPeriodShort(period?: string | null) {
  if (!period) return "-";
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  return `${String(month).padStart(2, "0")}/${year}`;
}

function suggestedFirstRentDueDate(startDate: string, period: string, timing: string) {
  if (timing === "vencido") return periodDueDate(period, "vencido");
  return startDate || `${period}-01`;
}

function periodMonthName(period: string) {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  return new Intl.DateTimeFormat("es-UY", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function personCodeLabel(code?: string) {
  return code?.trim() ? `Nº ${code.trim()}` : "Sin Nº";
}

function personRolePrefix(personType?: string) {
  if (personType === "owner") return "Prop";
  if (personType === "both") return "Inq/Prop";
  return "Inq";
}

function personDisplayLabel(person: Pick<Person, "legacy_code" | "full_name" | "person_type">) {
  const prefix = personRolePrefix(person.person_type);
  return `${prefix} ${person.legacy_code?.trim() || "s/n"} - ${person.full_name}`;
}

function personOptionLabel(person: Pick<Person, "legacy_code" | "full_name"> & { person_type?: string }) {
  const prefix = person.person_type ? personRolePrefix(person.person_type) : "Inq";
  return `${prefix} ${person.legacy_code?.trim() || "s/n"} - ${person.full_name}`;
}

function propertyOptionLabel(property: Pick<PropertyItem, "reference" | "address" | "door_number" | "unit_number">) {
  const unit = property.unit_number ? ` · Unidad ${property.unit_number}` : "";
  const door = property.door_number ? ` · Puerta ${property.door_number}` : "";
  return `Fin ${property.reference || "s/n"} - ${property.address || "Sin dirección"}${door}${unit}`;
}

function contractOptionLabel(contract: ContractItem) {
  return `Inq ${contract.tenant_legacy_code || "s/n"} - ${contract.tenant_name} · Fin ${contract.property_reference || "s/n"} - ${contract.property_address || "Sin dirección"}`;
}

function chargePropertyLabel(charge: Pick<Charge, "property_reference" | "property_address">) {
  return `Fin ${charge.property_reference || "s/n"} - ${charge.property_address || "Sin dirección"}`;
}

function chargeTenantLabel(charge: Pick<Charge, "tenant_legacy_code" | "tenant_name">) {
  return `Inq ${charge.tenant_legacy_code || "s/n"} - ${charge.tenant_name}`;
}

function cashMovementPersonLabel(movement: Pick<CashMovement, "movement_type" | "origin" | "person_legacy_code" | "person_name">) {
  const isOwnerMovement = movement.movement_type === "salida" || movement.origin.includes("owner") || movement.origin.includes("settlement") || movement.origin.includes("liquidacion");
  const prefix = isOwnerMovement ? "Prop" : "Inq";
  return `${prefix} ${movement.person_legacy_code || "s/n"} - ${movement.person_name || "Sin persona"}`;
}

function chargePeriodLabel(charge: Pick<Charge, "period" | "accrual_period" | "settlement_period" | "due_date">) {
  return charge.accrual_period || charge.period || charge.settlement_period || charge.due_date.slice(0, 7);
}

function dateToUtcDay(value: string | null | undefined) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
}

function inclusiveDays(start: number, end: number) {
  return Math.floor((end - start) / 86400000) + 1;
}

function inferProrationBaseAmount(charge?: Charge | null) {
  if (!charge?.proration_days || !charge.proration_total_days) return charge ? String(charge.amount) : "";
  if (charge.proration_days <= 0) return String(charge.amount);
  return String(Math.round((charge.amount * charge.proration_total_days) / charge.proration_days));
}

function calculateProrationPreview(
  baseAmountText: string,
  consumptionStart: string,
  consumptionEnd: string,
  contract?: ContractItem
) {
  const baseAmount = Number(baseAmountText);
  const consumptionStartDay = dateToUtcDay(consumptionStart);
  const consumptionEndDay = dateToUtcDay(consumptionEnd);
  const contractStartDay = dateToUtcDay(contract?.start_date);
  const contractEndDay = dateToUtcDay(contract?.billing_end_date || contract?.end_date || "");
  if (!contract || !baseAmount || !consumptionStartDay || !consumptionEndDay || !contractStartDay || consumptionEndDay < consumptionStartDay) {
    return null;
  }
  const totalDays = inclusiveDays(consumptionStartDay, consumptionEndDay);
  const occupancyStartDay = Math.max(consumptionStartDay, contractStartDay);
  const occupancyEndDay = Math.min(consumptionEndDay, contractEndDay ?? consumptionEndDay);
  const occupiedDays = occupancyEndDay < occupancyStartDay ? 0 : inclusiveDays(occupancyStartDay, occupancyEndDay);
  const amount = totalDays > 0 ? Math.round((baseAmount * occupiedDays) / totalDays) : baseAmount;
  const difference = Math.max(baseAmount - amount, 0);
  return { amount, occupiedDays, totalDays, difference };
}

function defaultServicePortal(serviceType: string) {
  const urls: Record<string, string> = {
    UTE: "https://www.ute.com.uy/imprima-su-factura",
    OSE: "https://facturas.ose.com.uy/SGCv10WebClient/inicio.faces",
    TRIBUTOS: "https://www.montevideo.gub.uy/fwtc/pages/tributosDomiciliarios.xhtml",
    SANEAMIENTO: "https://www.montevideo.gub.uy/fwtc/pages/saneamiento.xhtml",
    PRIMARIA: "https://dgi-anep.organismos.uy/paso2?1",
    CONTRIBUCION: "https://www.montevideo.gub.uy/fwtc/pages/contribucion.xhtml"
  };
  return urls[serviceType] ?? "";
}

function formatDateTime(value?: string) {
  if (!value) return "sin fecha";
  return new Intl.DateTimeFormat("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function buildWhatsappUrl(phone: string, message: string) {
  const cleaned = phone.replace(/\D/g, "");
  return cleaned ? `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}` : "";
}

function isVisitAlertActive(visit: PropertyVisit, now: Date) {
  if (visit.status === "realizada" || visit.status === "cancelada") return false;
  const visitDate = new Date(visit.visit_at);
  const alertFrom = new Date(visitDate.getTime() - visit.reminder_minutes_before * 60 * 1000);
  const keepUntil = new Date(visitDate.getTime() + 24 * 60 * 60 * 1000);
  return now >= alertFrom && now <= keepUntil;
}

function legacyCodeValue(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value.toLowerCase();
}

function PublicPortal() {
  const token = window.location.pathname.split("/").pop() ?? "";
  const [data, setData] = useState<PublicPortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api
      .publicPortal(token)
      .then(setData)
      .catch((error) => setMessage(error.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function simulatePayment() {
    setMessage("");
    try {
      const response = await api.paymentIntent(token, {
        payer_name: data?.person.full_name,
        message: "Pago simulado desde portal publico"
      });
      setMessage(response.message);
      const refreshed = await api.publicPortal(token);
      setData(refreshed);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo registrar");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="rounded-lg bg-white p-6 shadow-panel">{message || "Link no disponible"}</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <section className="mx-auto max-w-3xl">
        <div className="mb-5 flex items-center justify-between rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
          <div>
            <p className="text-sm font-medium text-muted">Estado de cuenta</p>
            <h1 className="text-2xl font-semibold text-ink">{data.person.full_name}</h1>
          </div>
          <div className="rounded-md bg-emerald-50 px-3 py-2 text-right text-sm font-semibold text-emerald-700">
            {data.status}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white shadow-panel">
          <div className="border-b border-slate-100 p-5">
            <p className="text-sm text-muted">Total pendiente</p>
            <p className="text-3xl font-semibold text-ink">{formatCurrency(data.total)}</p>
          </div>
          <div className="divide-y divide-slate-100">
            {data.charges.map((charge) => (
              <div key={charge.id} className="grid gap-2 p-5 sm:grid-cols-[1fr_auto]">
                <div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={charge.status} />
                    <p className="font-semibold text-ink">{charge.concept}</p>
                  </div>
                  <p className="mt-1 text-sm text-muted">{charge.description}</p>
                  <p className="mt-1 text-sm text-muted">Vence {charge.due_date}</p>
                </div>
                <p className="text-lg font-semibold text-ink">{formatCurrency(charge.remaining_amount)}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">Pago real pendiente de integrar con pasarela.</p>
            <button className="btn-primary" onClick={simulatePayment}>
              <CreditCard className="h-4 w-4" />
              Simular intención de pago
            </button>
          </div>
        </div>
        {message && <div className="mt-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">{message}</div>}
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: ChargeStatus }) {
  const meta = statusMeta[status];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${meta.className}`}>
      <span className={`status-dot ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm text-muted">{detail}</p>
    </div>
  );
}

function App() {
  if (window.location.pathname.startsWith("/public/")) {
    return <PublicPortal />;
  }

  const [token, setToken] = useState(() => localStorage.getItem("salgueiro_token") ?? "");
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [propertyVisits, setPropertyVisits] = useState<PropertyVisit[]>([]);
  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);
  const [ownerCharges, setOwnerCharges] = useState<OwnerCharge[]>([]);
  const [tenantCredits, setTenantCredits] = useState<TenantCredit[]>([]);
  const [invoiceDocuments, setInvoiceDocuments] = useState<InvoiceDocument[]>([]);
  const [emailInboxes, setEmailInboxes] = useState<EmailInboxConfig[]>([]);
  const [emailSetup, setEmailSetup] = useState<EmailSetupStatus | null>(null);
  const [statusFilter, setStatusFilter] = useState("todas");
  const [search, setSearch] = useState("");
  const [selectedCharge, setSelectedCharge] = useState<Charge | null>(null);
  const [selectedCharges, setSelectedCharges] = useState<Charge[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<PropertyItem | null>(null);
  const [selectedContract, setSelectedContract] = useState<ContractItem | null>(null);
  const [modal, setModal] = useState<AppModal>(null);
  const [personModalDefaultType, setPersonModalDefaultType] = useState<Person["person_type"]>("tenant");
  const [freePaymentDefaultMethod, setFreePaymentDefaultMethod] = useState("transferencia");
  const [selectedInstitution, setSelectedInstitution] = useState<"anda" | "contaduria">("anda");
  const [publicLink, setPublicLink] = useState("");
  const [now, setNow] = useState(() => new Date());

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [summary, persons, props, visitsData, contractsData, chargesData, settlementsData, cashData, ownerChargeData, creditsData, invoiceData, inboxData, emailSetupData] =
        await Promise.all([
          api.dashboard(),
          api.people(),
          api.properties(),
          api.propertyVisits(),
          api.contracts(),
          api.charges(),
          api.settlements(),
          api.cashMovements(),
          api.ownerCharges(),
          api.tenantCredits(),
          api.invoiceDocuments(),
          api.emailInboxes(),
          api.emailSetupStatus()
        ]);
      setDashboard(summary);
      setPeople(persons);
      setProperties(props);
      setPropertyVisits(visitsData);
      setContracts(contractsData);
      setCharges(chargesData);
      setSettlements(settlementsData);
      setCashMovements(cashData);
      setOwnerCharges(ownerChargeData);
      setTenantCredits(creditsData);
      setInvoiceDocuments(invoiceData);
      setEmailInboxes(inboxData);
      setEmailSetup(emailSetupData);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo cargar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) {
      loadAll();
    }
  }, [token]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const filteredCharges = useMemo(() => {
    return charges.filter((charge) => {
      const matchesStatus = statusFilter === "todas" || charge.status === statusFilter;
      const needle = search.toLowerCase();
      const matchesSearch =
        !needle ||
        charge.tenant_name.toLowerCase().includes(needle) ||
        charge.property_address.toLowerCase().includes(needle) ||
        charge.concept.toLowerCase().includes(needle) ||
        charge.description.toLowerCase().includes(needle);
      return matchesStatus && matchesSearch;
    });
  }, [charges, search, statusFilter]);

  const openChargesForPerson = (personId: number) =>
    charges.filter((charge) => charge.responsible_person_id === personId && charge.status !== "pagado");

  function openChargeModal(charge: Charge | null = null) {
    setSelectedCharge(charge);
    setModal("charge");
  }

  function openPayment(charge: Charge) {
    setSelectedCharge(charge);
    setModal("payment");
  }

  function openReminder(chargesToSend: Charge[]) {
    const openItems = chargesToSend.filter((charge) => charge.status !== "pagado");
    if (!openItems.length) {
      setError("No hay deudas abiertas para generar recordatorio.");
      return;
    }
    setSelectedCharges(openItems);
    setModal("reminder");
  }

  function openPublicLink(chargesToLink: Charge[]) {
    const openItems = chargesToLink.filter((charge) => charge.status !== "pagado");
    if (!openItems.length) {
      setError("No hay deudas abiertas para crear link público.");
      return;
    }
    setPublicLink("");
    setSelectedCharges(openItems);
    setModal("link");
  }

  const visitAlerts = useMemo(() => {
    return propertyVisits.filter((visit) => isVisitAlertActive(visit, now));
  }, [propertyVisits, now]);

  async function removeEntity(label: string, action: () => Promise<unknown>) {
    if (!window.confirm(`Eliminar ${label}?`)) return;
    setError("");
    try {
      await action();
      await loadAll();
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo eliminar");
    }
  }

  if (!token) {
    return <Login onLogin={(newToken) => {
      localStorage.setItem("salgueiro_token", newToken);
      setToken(newToken);
    }} />;
  }

  const activeLabel = navItems.find((item) => item.id === activeView)?.label ?? "";

  return (
    <div className="min-h-screen bg-slate-50 text-ink">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 transform border-r border-slate-200 bg-white transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-slate-100 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">POC</p>
                <h1 className="mt-1 text-lg font-semibold text-ink">Salgueiro Admin</h1>
              </div>
              <button className="icon-btn lg:hidden" onClick={() => setSidebarOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <nav className="flex-1 space-y-1 p-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition ${
                    active ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100 hover:text-ink"
                  }`}
                  onClick={() => {
                    setActiveView(item.id);
                    setSidebarOpen(false);
                  }}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="border-t border-slate-100 p-3">
            <button
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              onClick={() => {
                localStorage.removeItem("salgueiro_token");
                setToken("");
              }}
            >
              <LogOut className="h-4 w-4" />
              Salir
            </button>
          </div>
        </div>
      </aside>

      <main className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button className="icon-btn lg:hidden" onClick={() => setSidebarOpen(true)}>
                <Menu className="h-5 w-5" />
              </button>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Operacion diaria</p>
                <h2 className="text-xl font-semibold text-ink">{activeLabel}</h2>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {visitAlerts.length > 0 && (
                <button className="btn-secondary border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100" onClick={() => setActiveView("visits")}>
                  <Bell className="h-4 w-4" />
                  {visitAlerts.length === 1 ? "1 visita" : `${visitAlerts.length} visitas`}
                </button>
              )}
              <button className="btn-secondary" onClick={loadAll} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Actualizar
              </button>
            </div>
          </div>
        </header>

        <div className="p-4 sm:p-6">
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
          {visitAlerts.length > 0 && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  <span className="font-semibold">
                    {visitAlerts.length === 1 ? "Tenés 1 visita para confirmar" : `Tenés ${visitAlerts.length} visitas para confirmar`}
                  </span>
                  <span>{formatDateTime(visitAlerts[0].visit_at)} · {visitAlerts[0].property_reference}</span>
                </div>
                <div className="flex gap-2">
                  {visitAlerts[0].notification_phone && (
                    <a className="btn-secondary" href={buildWhatsappUrl(visitAlerts[0].notification_phone, `Recordatorio de visita: ${visitAlerts[0].interested_name} en ${visitAlerts[0].property_reference} el ${formatDateTime(visitAlerts[0].visit_at)}. Tel: ${visitAlerts[0].interested_phone || "sin dato"}`)} target="_blank" rel="noreferrer">
                      <MessageCircle className="h-4 w-4" />
                      Avisar por WhatsApp
                    </a>
                  )}
                  <button className="btn-secondary" onClick={() => setActiveView("visits")}>
                    Ver agenda
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeView === "dashboard" && (
            <DashboardView
              summary={dashboard}
              charges={charges}
              onPay={openPayment}
              onReminder={(charge) => openReminder([charge])}
            />
          )}

          {activeView === "charges" && (
            <ChargesView
              charges={filteredCharges}
              allCharges={charges}
              ownerCharges={ownerCharges}
              cashMovements={cashMovements}
              statusFilter={statusFilter}
              search={search}
              setStatusFilter={setStatusFilter}
              setSearch={setSearch}
              onNewTenantCharge={() => openChargeModal()}
              onNewOwnerCharge={() => setModal("ownerCharge")}
              onNewTenantCredit={() => setModal("tenantCredit")}
              onNewOwnerCredit={() => setModal("ownerCredit")}
              onBulkMonthly={async () => {
                const result = await api.bulkMonthly(currentPeriod(), 10);
                await loadAll();
                setError(result.created ? "" : "No se crearon alquileres nuevos para este periodo.");
              }}
              onPay={openPayment}
              onReminder={(charge) => openReminder([charge])}
              onLink={(charge) => openPublicLink([charge])}
              onEdit={(charge) => openChargeModal(charge)}
              onDelete={(charge) => removeEntity("esta deuda", () => api.deleteCharge(charge.id))}
              onVoidOwnerCharge={async (ownerCharge) => {
                const reason = window.prompt("Motivo de anulación", "Error de carga");
                if (!reason) return;
                await api.voidOwnerCharge(ownerCharge.id, reason);
                await loadAll();
              }}
            />
          )}
          {activeView === "invoices" && (
            <InvoicesView
              invoices={invoiceDocuments}
              inboxes={emailInboxes}
              setup={emailSetup}
              onRefresh={loadAll}
              onImport={async (file) => {
                await api.importInvoiceDocument(file, "manual");
                await loadAll();
              }}
              onCreateCharge={async (invoice) => {
                await api.createChargeFromInvoice(invoice.id);
                await loadAll();
              }}
              onDeleteInvoice={async (invoice) => removeEntity("esta factura", () => api.deleteInvoiceDocument(invoice.id))}
              onCreateInbox={async (payload) => {
                await api.createEmailInbox(payload);
                await loadAll();
              }}
              onCreateRule={async (inboxId, payload) => {
                await api.createEmailRule(inboxId, payload);
                await loadAll();
              }}
              onScanInbox={async (inboxId) => {
                const result = await api.scanEmailInbox(inboxId);
                await loadAll();
                setError(result.run.status === "ok" ? "" : result.run.notes);
                return result;
              }}
            />
          )}

          {activeView === "tenants" && (
            <TenantsView
              people={people.filter((p) => p.person_type !== "owner")}
              owners={people.filter((p) => p.person_type !== "tenant")}
              getOpenCharges={openChargesForPerson}
              onNew={() => {
                setSelectedPerson(null);
                setPersonModalDefaultType("tenant");
                setModal("person");
              }}
              onEdit={(person) => {
                setSelectedPerson(person);
                setPersonModalDefaultType(person.person_type);
                setModal("person");
              }}
              onDelete={(person) => removeEntity(person.full_name, () => api.deletePerson(person.id))}
              onDetail={(person) => {
                setSelectedPerson(person);
                setModal("tenantDetail");
              }}
              onReminder={(person) => openReminder(openChargesForPerson(person.id))}
              onLink={(person) => openPublicLink(openChargesForPerson(person.id))}
              onPayGroup={(person) => {
                const openItems = openChargesForPerson(person.id);
                if (!openItems.length) {
                  setError("El inquilino no tiene deudas abiertas.");
                  return;
                }
                setSelectedPerson(person);
                setSelectedCharges(openItems);
                setModal("batchPayment");
              }}
            />
          )}
          {activeView === "owners" && (
            <OwnersView
              people={people.filter((p) => p.person_type !== "tenant")}
              properties={properties}
              settlements={settlements}
              onNew={() => {
                setSelectedPerson(null);
                setPersonModalDefaultType("owner");
                setModal("person");
              }}
              onEdit={(person) => {
                setSelectedPerson(person);
                setPersonModalDefaultType(person.person_type);
                setModal("person");
              }}
              onDelete={(person) => removeEntity(person.full_name, () => api.deletePerson(person.id))}
            />
          )}
          {activeView === "properties" && (
            <PropertiesView
              properties={properties}
              onNew={() => {
                setSelectedProperty(null);
                setModal("property");
              }}
              onEdit={(property) => {
                setSelectedProperty(property);
                setModal("property");
              }}
              onDetail={(property) => {
                setSelectedProperty(property);
                setModal("propertyDetail");
              }}
              onDelete={(property) => removeEntity(property.reference, () => api.deleteProperty(property.id))}
            />
          )}
          {activeView === "visits" && (
            <VisitsView
              visits={propertyVisits}
              properties={properties}
              onRefresh={loadAll}
            />
          )}
          {activeView === "contracts" && (
            <ContractsView
              contracts={contracts}
              onNew={() => {
                setSelectedContract(null);
                setModal("contract");
              }}
              onEdit={(contract) => {
                setSelectedContract(contract);
                setModal("contract");
              }}
              onReajustment={(contract) => {
                setSelectedContract(contract);
                setModal("reajustment");
              }}
              onDelete={(contract) => removeEntity(`contrato de ${contract.tenant_name}`, () => api.deleteContract(contract.id))}
            />
          )}
          {activeView === "payments" && (
            <PaymentsView
              people={people.filter((p) => p.person_type !== "owner")}
              charges={charges.filter((charge) => charge.status !== "pagado")}
              credits={tenantCredits}
              onPay={openPayment}
              onBatchPay={(person, personCharges) => {
                setSelectedPerson(person);
                setSelectedCharges(personCharges);
                setModal("batchPayment");
              }}
              onNewPayment={(person) => {
                setSelectedPerson(person);
                setFreePaymentDefaultMethod("transferencia");
                setModal("freePayment");
              }}
              onInstitutionalReconciliation={(institution) => {
                setSelectedInstitution(institution);
                setModal("institutionalReconciliation");
              }}
            />
          )}
          {activeView === "cash" && (
            <CashView
              movements={cashMovements}
              ownerCharges={ownerCharges}
              credits={tenantCredits}
              owners={people.filter((person) => person.person_type !== "tenant")}
              properties={properties}
              onNewOwnerCharge={() => setModal("ownerCharge")}
              onVoidOwnerCharge={async (ownerCharge) => {
                const reason = window.prompt("Motivo de anulación", "Error de carga");
                if (!reason) return;
                await api.voidOwnerCharge(ownerCharge.id, reason);
                await loadAll();
              }}
            />
          )}
          {activeView === "settlements" && (
            <SettlementsView
              settlements={settlements}
              onGenerate={async (period) => {
                const result = await api.generateSettlements(period);
                setSettlements(result);
                await loadAll();
              }}
              onPay={async (settlement) => {
                await api.paySettlement(settlement.id, {
                  movement_date: todayIso(),
                  notes: `Pago de liquidación ${settlement.period} a ${settlement.owner_name}`
                });
                await loadAll();
              }}
            />
          )}
        </div>
      </main>
      <FloatingHelpWidget />

      {modal === "charge" && (
        <ChargeModal
          contracts={contracts}
          properties={properties}
          allCharges={charges}
          charge={selectedCharge}
          onRefreshData={loadAll}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await loadAll();
          }}
        />
      )}
      {modal === "payment" && selectedCharge && (
        <PaymentModal
          charge={selectedCharge}
          contracts={contracts}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await loadAll();
          }}
        />
      )}
      {modal === "batchPayment" && selectedPerson && (
        <BatchPaymentModal
          person={selectedPerson}
          charges={selectedCharges}
          allCharges={charges.filter((charge) => charge.responsible_person_id === selectedPerson.id)}
          contracts={contracts}
          credits={tenantCredits}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await loadAll();
          }}
        />
      )}
      {modal === "reminder" && selectedCharges.length > 0 && (
        <ReminderModal charges={selectedCharges} onClose={() => setModal(null)} />
      )}
      {modal === "link" && selectedCharges.length > 0 && (
        <LinkModal
          charges={selectedCharges}
          publicLink={publicLink}
          setPublicLink={setPublicLink}
          onClose={() => {
            setPublicLink("");
            setModal(null);
          }}
        />
      )}
      {modal === "person" && (
        <PersonModal
          person={selectedPerson}
          defaultType={personModalDefaultType}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await loadAll();
          }}
        />
      )}
      {modal === "property" && (
        <PropertyModal
          property={selectedProperty}
          owners={people.filter((person) => person.person_type !== "tenant")}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await loadAll();
          }}
        />
      )}
      {modal === "contract" && (
        <ContractModal
          contract={selectedContract}
          properties={properties}
          tenants={people.filter((person) => person.person_type !== "owner")}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await loadAll();
          }}
        />
      )}
      {modal === "reajustment" && selectedContract && (
        <ReajustmentModal
          contract={selectedContract}
          onClose={() => setModal(null)}
          onApplied={async () => {
            setModal(null);
            await loadAll();
          }}
        />
      )}
      {modal === "ownerCharge" && (
        <OwnerChargeModal
          owners={people.filter((person) => person.person_type !== "tenant")}
          properties={properties}
          ownerCharges={ownerCharges}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await loadAll();
          }}
        />
      )}
      {modal === "tenantCredit" && (
        <TenantCreditModal
          tenants={people.filter((person) => person.person_type !== "owner")}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await loadAll();
          }}
        />
      )}
      {modal === "ownerCredit" && (
        <OwnerCreditModal
          owners={people.filter((person) => person.person_type !== "tenant")}
          properties={properties}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await loadAll();
          }}
        />
      )}
      {modal === "tenantDetail" && selectedPerson && (
        <TenantDetailModal person={selectedPerson} onClose={() => setModal(null)} />
      )}
      {modal === "propertyDetail" && selectedProperty && (
        <PropertyDetailModal property={selectedProperty} onClose={() => setModal(null)} />
      )}
      {modal === "freePayment" && selectedPerson && (
        <FreePaymentModal
          person={selectedPerson}
          defaultMethod={freePaymentDefaultMethod}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await loadAll();
          }}
        />
      )}
      {modal === "institutionalReconciliation" && (
        <InstitutionalReconciliationModal
          institution={selectedInstitution}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [email, setEmail] = useState("admin@salgueiro.test");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await api.login(email, password);
      onLogin(response.access_token);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo ingresar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-panel">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Inmobiliaria Salgueiro</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Panel operativo</h1>
        <p className="mt-2 text-sm text-muted">Demo interna para cargar deudas, registrar pagos y acelerar recordatorios.</p>
        <label className="form-label mt-6">Email</label>
        <input className="input" value={email} onChange={(event) => setEmail(event.target.value)} />
        <label className="form-label mt-4">Password</label>
        <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        {error && <p className="mt-3 rounded-md bg-rose-50 p-2 text-sm text-rose-700">{error}</p>}
        <button className="btn-primary mt-5 w-full justify-center" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Entrar
        </button>
      </form>
    </main>
  );
}

function DashboardView({
  summary,
  charges,
  onPay,
  onReminder
}: {
  summary: DashboardSummary | null;
  charges: Charge[];
  onPay: (charge: Charge) => void;
  onReminder: (charge: Charge) => void;
}) {
  const overdue = (summary?.overdue_charges?.length ? summary.overdue_charges : charges.filter((charge) => charge.status === "vencido" || charge.status === "parcial")).slice(0, 8);
  const dueSoon = (summary?.due_soon ?? []).slice(0, 8);
  const dueSoonTotal = dueSoon.reduce((sum, charge) => sum + charge.remaining_amount, 0);
  const reajustmentsCount = summary?.reajustments_due_soon?.length ?? 0;
  const recentPaymentsCount = summary?.recent_payments?.length ?? 0;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <Metric title="Vencidas" value={formatCurrency(summary?.overdue_total ?? 0)} icon={AlertCircle} tone="rose" />
        <Metric title="Próximas a vencer" value={formatCurrency(dueSoonTotal)} icon={CalendarDays} tone="amber" />
        <Metric title="Reajustes 30 días" value={String(reajustmentsCount)} icon={Bell} tone="blue" />
        <Metric title="Pagos recientes" value={String(recentPaymentsCount)} icon={Banknote} tone="green" />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Vencidas" action={<span className="text-sm text-muted">incluye pagos parciales con saldo</span>}>
          {overdue.length ? (
            <div className="divide-y divide-slate-100">
              {overdue.map((charge) => (
                <ChargeRow key={charge.id} charge={charge} onPay={onPay} onReminder={onReminder} compact />
              ))}
            </div>
          ) : (
            <EmptyState title="Sin urgencias" detail="No hay deudas vencidas o parciales en este momento." />
          )}
        </Panel>
        <Panel title="Próximas a vencer" action={<span className="text-sm text-muted">próximos 7 días</span>}>
          {dueSoon.length ? (
            <div className="divide-y divide-slate-100">
              {dueSoon.map((charge) => (
                <ChargeRow key={charge.id} charge={charge} onPay={onPay} onReminder={onReminder} compact />
              ))}
            </div>
          ) : (
            <EmptyState title="Sin próximas" detail="No hay deudas a vencer en los próximos días." />
          )}
        </Panel>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Reajustes próximos" action={<span className="text-sm text-muted">próximos 30 días</span>}>
          {(summary?.reajustments_due_soon ?? []).length ? (
            <div className="divide-y divide-slate-100">
              {(summary?.reajustments_due_soon ?? []).map((item) => (
                <div key={item.id} className="py-3 text-sm">
                  <p className="font-semibold text-ink">Inq {item.tenant_legacy_code || "s/n"} - {item.tenant_name}</p>
                  <p className="text-muted">Fin {item.property_reference || "s/n"} - {item.property_address || "sin dirección"} · {item.next_reajustment_date || "sin fecha"}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Sin reajustes" detail="Cuando un contrato tenga fecha de reajuste, aparecerá acá." />
          )}
        </Panel>
        <Panel title="Pagos recientes">
          <div className="space-y-3">
            {(summary?.recent_payments ?? []).map((payment) => (
              <div key={payment.id} className="rounded-md border border-slate-100 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-ink">{payment.person_name}</p>
                  <p className="font-semibold text-emerald-700">{formatCurrency(payment.amount)}</p>
                </div>
                <p className="mt-1 text-sm text-muted">{payment.payment_date} · {payment.method}</p>
                <a className="btn-secondary mt-3 w-full justify-center text-xs" href={exportUrl(`/payments/${payment.id}/receipt.pdf`)}>
                  <ArrowDownToLine className="h-4 w-4" />
                  Descargar recibo PDF
                </a>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      {(summary?.retention_vouchers_pending ?? []).length > 0 && (
        <Panel title="Resguardos pendientes" action={<span className="text-sm text-muted">CEDE / ANDA / Contaduría</span>}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {(summary?.retention_vouchers_pending ?? []).map((voucher) => (
              <div key={voucher.id} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="font-semibold text-amber-950">{voucher.source} · {voucher.period}</p>
                <p className="text-amber-900">{voucher.tenant_name || "Sin inquilino"} · {voucher.property_reference || "Sin finca"}</p>
                <p className="mt-1 font-semibold text-amber-950">{formatCurrency(voucher.amount)}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

const helpTopics = [
	  {
	    category: "Pagos",
	    question: "Como registro un pago si todavia no hay deuda?",
	    answer:
	      "Entra a Pagos, elegi el inquilino y toca Pago sin imputar. El dinero entra a Caja y queda como saldo a favor del inquilino para aplicarlo despues."
	  },
	  {
	    category: "Pagos",
	    question: "Como cobro alquileres?",
	    answer:
	      "En Pagos, busca el inquilino y toca Ingreso pago. La grilla muestra deudas existentes y alquileres esperados de los proximos meses; tilda los meses que cobra, confirma y Caja registra la entrada."
	  },
	  {
	    category: "Pagos",
	    question: "Como registro un pago cuando hay varios titulares?",
	    answer:
	      "En Pagos, elegi el inquilino y toca Ingreso pago. El sistema muestra Titular que paga con todos los titulares del contrato. Elegi quien pago, tilda las deudas o alquileres y confirma; Caja registra la entrada."
	  },
  {
    category: "Pagos",
    question: "Como corrijo un pago imputado a la deuda equivocada?",
    answer:
      "En Inquilinos, abri la ficha y en Pagos toca el icono de corregir imputacion. Si tambien se cargo mal el importe, podes usar Pagar saldo en la deuda real para completar monto e imputacion de una vez. Caja queda trazable: si el monto cambia, se crea un ajuste solo por la diferencia."
  },
  {
    category: "Deudas",
    question: "Cuando uso Nueva deuda?",
    answer:
      "En Deudas tenes botones separados: Nueva deuda inquilino para cargos al inquilino y Nueva deuda propietario para gastos que se descuentan en liquidacion. Si viene de una factura detectada, conviene crear el cargo desde Facturas."
  },
  {
    category: "Deudas",
    question: "Como cargo tributos o impuestos al inquilino?",
    answer:
      "En Nueva deuda inquilino elegi el contrato, concepto y monto. La deuda siempre queda a cargo del inquilino; por eso ya no se elige Responsable. Liquidacion solo aparece para Gastos comunes, porque en UTE/OSE/tributos alcanza con Mes/año deuda, Devengado y/o Consumo desde/hasta."
  },
  {
    category: "Deudas",
    question: "Donde veo historiales de deuda?",
    answer:
      "En Deudas usa Historial inquilinos o Historial propietarios. Podes filtrar por persona, finca, concepto, estado y rango de fechas para ver todas las deudas de cada uno."
  },
  {
    category: "Deudas",
    question: "Como reviso que paso en un rango de dias?",
    answer:
      "En Deudas toca Historial cronologico. Carga Desde y Hasta, por ejemplo del 1 al 10, y el sistema muestra vencimientos, pagos registrados y debitos a propietarios por dia."
  },
  {
    category: "Contratos",
    question: "Como cargo garantia, regimen y titulares?",
    answer:
      "En Contratos, toca Nuevo contrato o Editar. Selecciona la garantia: ANDA carga 2% y Contaduria 3% automaticamente. Elegi Regimen legal o Libre contratacion, y marca Titulares adicionales para guardar todos los responsables del contrato."
  },
  {
    category: "Contratos",
    question: "Que diferencia hay entre Fin contractual y Cobrar/generar hasta?",
    answer:
      "Fin contractual es la fecha real del contrato firmado. Cobrar/generar hasta es la fecha operativa hasta la que el sistema muestra o genera alquileres. Si queda vacia, usa Fin contractual. Sirve para locales o contratos que vencieron formalmente pero siguen correspondiendo cobrar."
  },
  {
    category: "Contratos",
    question: "Como cargo un primer alquiler o cuota inicial?",
    answer:
      "En Contratos, crea o edita el contrato y marca Generar primer alquiler / cuota inicial. Completa Mes/año que corresponde, Importe primer alquiler y Fecha de vencimiento. Al guardar, se crea una deuda real ALQUILER con descripcion Primer alquiler / cuota inicial."
  },
  {
    category: "Contratos",
    question: "Como funciona un contrato con alquiler vencido?",
    answer:
      "En Contratos, pone Momento alquiler en Vencido. En Pagos > Ingreso pago, el sistema muestra el mes anterior como Mes/año y el vencimiento del mes actual. Ejemplo: al cobrar en junio muestra Mes/año 05/2026 y Vence 10/06/2026."
  },
	  {
	    category: "Contratos",
	    question: "Como veo los datos de todos los titulares?",
	    answer:
	      "En Contratos, expandi la tarjeta con la flecha. En el bloque Titulares aparecen nombre, cedula, correo y celular de cada titular cargado en el contrato."
	  },
	  {
	    category: "Contratos",
	    question: "Como marco un contrato CEDE o con resguardo?",
	    answer:
	      "En Contratos, edita el contrato y en Tipo fiscal inquilino elegi CEDE / agente de retencion. El sistema marca Resguardo requerido y al generar liquidaciones crea el pendiente para controlar en Dashboard."
	  },
  {
    category: "Reajustes",
    question: "Como programo una alerta de reajuste?",
    answer:
      "En Contratos, toca la campana del contrato, elegi la fecha de reajuste y toca Guardar alerta. Si la fecha queda dentro de los proximos 30 dias, aparece en Dashboard dentro de Reajustes proximos."
  },
	  {
	    category: "Reajustes",
	    question: "Como calculo y aviso un aumento de alquiler?",
	    answer:
	      "En Contratos, toca la campana. Para Regimen legal el sistema busca el indice de Caja Notarial: si el alquiler es adelantado usa el mes de la fecha, y si es vencido usa el mes anterior. La pantalla muestra Mes indice. Para Libre podes ingresar un factor manual."
	  },
  {
    category: "Reajustes",
    question: "Que diferencia hay entre Guardar alerta y Aplicar reajuste?",
    answer:
      "Guardar alerta solo guarda la proxima fecha para que aparezca en el Dashboard. Aplicar reajuste calcula el nuevo alquiler, lo guarda en el contrato y mueve la proxima fecha de reajuste al año siguiente."
  },
  {
    category: "Facturas",
    question: "Que hace el modulo Facturas?",
    answer:
      "Sirve para capturar facturas desde correo o cargar un archivo local. El sistema intenta leer proveedor, cuenta, importe y vencimiento, asociarlo a una propiedad y luego convertirlo en deuda."
  },
	  {
	    category: "Facturas",
	    question: "Como hago que una factura se asocie sola?",
	    answer:
	      "Primero carga en la propiedad sus cuentas de servicios: UTE, OSE, gastos comunes u otros. Despues crea reglas de correo para reconocer remitente o asunto. Cuando llegue una factura con esa cuenta, el sistema la vincula."
	  },
	  {
	    category: "Facturas",
	    question: "Que datos lee de una factura OSE?",
	    answer:
	      "Al cargar un PDF de OSE, intenta leer cuenta, referencia/cobro, vencimiento, importe, periodo de consumo, medidor y consumo en m3. Si hay periodo de consumo, al crear la deuda puede prorratear por dias de ocupacion del contrato."
	  },
	  {
	    category: "Facturas",
	    question: "Puedo cargar facturas que no sean UTE?",
	    answer:
	      "Si. Podes adjuntar PDF o foto de UTE, OSE, saneamiento, tributos u otros. UTE y OSE tienen lectura mas guiada; en los demas casos revisa proveedor, cuenta, importe y vencimiento antes de guardar la deuda."
	  },
	  {
	    category: "Caja",
    question: "Que es Caja?",
    answer:
      "Caja es el registro de plata que entra y sale. Por ejemplo, cuando un inquilino paga, entra dinero. Cuando se carga un debito al propietario o una salida, queda registrado para tener trazabilidad."
  },
	  {
	    category: "Caja",
	    question: "Que significa debito al propietario?",
	    answer:
	      "Es un gasto que se le descuenta al propietario en su liquidacion. Por ejemplo, un arreglo, tributo o gasto que pago la inmobiliaria y despues se descuenta al momento de liquidar."
	  },
	  {
	    category: "Deudas",
	    question: "Como hago que una deuda tambien impacte al propietario?",
	    answer:
	      "En Nueva deuda, marca Tambien asociar/descontar al propietario. Elegi el concepto, si la inmobiliaria lo pago y si se reparte por porcentaje. Al guardar queda vinculado un debito para la liquidacion."
	  },
  {
    category: "Deudas",
    question: "Como reparto un debito propietario entre copropietarios?",
    answer:
      "En Nueva deuda propietario elegi la finca, monto y marca Repartir entre propietarios segun porcentaje. El sistema muestra una vista previa y crea un debito separado para cada propietario de la finca, segun el porcentaje cargado en Propiedades."
  },
  {
    category: "Liquidaciones",
    question: "Que es una liquidacion?",
    answer:
      "Es el resumen mensual de cuanto se cobro por una propiedad, cuanto se descuenta por comision, IVA, IRPF, gastos y comision bancaria, y cuanto queda para girarle al propietario."
  },
  {
    category: "Liquidaciones",
    question: "Como descuento la comision bancaria por transferencia?",
    answer:
      "En Propietarios, edita la persona y completa el bloque Transferencia al propietario. Si el banco no es BROU, el sistema tilda el descuento; podes destildarlo o cambiar el importe, por ejemplo 65. Al generar liquidaciones se muestra como Banco y se descuenta del total a girar."
  },
	  {
	    category: "Liquidaciones",
	    question: "Como descargo comprobantes en PDF?",
	    answer:
	      "En Dashboard o ficha de inquilino toca Descargar recibo PDF para pagos. En Liquidaciones toca Descargar liquidacion PDF o Descargar retiro PDF. En Caja, las salidas tienen un boton de retiro PDF."
	  },
	  {
	    category: "Liquidaciones",
	    question: "Como registro que ya le pagamos al propietario?",
	    answer:
	      "En Liquidaciones, genera el periodo y toca Registrar pago/retiro. Eso crea una salida real en Caja por el total a girar y marca la liquidacion como emitida."
	  },
  {
    category: "Reportes",
    question: "Donde descargo deudores y comision/IVA?",
    answer:
      "En Inquilinos tenes Inquilinos deudores y Deudores por propietario. En Caja tenes Comision e IVA e Historial facturacion. En Liquidaciones siguen disponibles los PDFs del periodo."
  },
  {
    category: "Reportes",
    question: "Como veo la cobranza realizada?",
    answer:
      "En Inquilinos toca Cobranza realizada. Filtra por fecha o inquilino para ver pagos cobrados, finca, concepto, comision, IVA y el boton del recibo PDF."
  },
  {
    category: "Caja",
    question: "Como veo comision e IVA generados?",
    answer:
      "En Caja toca Comision e IVA. Filtra por fecha y propietario para revisar comision, IVA y total facturado por cada pago o concepto."
  },
  {
    category: "Caja",
    question: "Donde veo el historial de facturacion?",
    answer:
      "En Caja toca Historial facturacion. Es la misma base de control de comisiones e IVA, pero enfocada en cuando se genero y desde que pago/concepto."
  },
  {
    category: "Caja",
    question: "Donde veo pagos o retiros hechos a propietarios?",
    answer:
      "En Caja > Movimientos cambia Origen a Retiros propietario. Ahi quedan las salidas generadas al registrar el pago de una liquidacion y podes descargar el retiro PDF."
  },
  {
    category: "Propietarios",
    question: "Como veo saldos de propietarios?",
    answer:
      "En Propietarios toca Saldos de propietarios. Filtra hasta una fecha para comparar lo liquidado, lo pagado/retirado y el saldo pendiente o a favor."
  },
  {
    category: "Propietarios",
    question: "Como saco alquileres cobrados por cedula para DGI?",
    answer:
      "En Propietarios toca Alquileres cobrados por cedula. Filtra periodo o propietario y revisa cedula/RUT, porcentaje, alquiler cobrado, importe del propietario e IRPF."
  },
  {
    category: "Contratos",
    question: "Como veo contratos vigentes por garantia o vencidos?",
    answer:
      "En Contratos usa los botones Vigentes por garantia y Vencidos / historico. Los vencidos quedan visibles para consulta, pero no generan reajustes, liquidaciones ni facturas nuevas."
  },
  {
    category: "Liquidaciones",
    question: "Que pasa si una propiedad tiene dos propietarios?",
    answer:
      "La liquidacion reparte los importes segun el porcentaje configurado en la propiedad. Si son 50% y 50%, cada uno recibe y descuenta su mitad. Si es 60% y 40%, se reparte de esa forma."
  },
  {
    category: "IRPF",
    question: "Como se calcula el IRPF?",
    answer:
      "El sistema lo calcula solo cuando el contrato y el propietario tienen IRPF activo. Es una regla configurable y debe validarse con contador o escribano antes de usarlo en produccion."
  },
  {
    category: "IRPF",
    question: "Como marco un propietario exonerado de IRPF?",
    answer:
      "En Propiedades, abri la ficha con el ojo, busca el panel Propietarios y toca Editar IRPF. Destilda IRPF aplica para el propietario exonerado y guarda. La ficha queda marcada como IRPF no para ese propietario."
  },
  {
    category: "Propiedades",
    question: "Donde cargo UTE, OSE o gastos comunes?",
    answer:
      "En Propiedades, abri el detalle de la propiedad y entra a Cuentas de servicios. Ahi agregas proveedor, cuenta o referencia, quien paga y notas como unidad o padron."
  },
  {
    category: "Propiedades",
    question: "Como pruebo la asociacion automatica de facturas?",
    answer:
      "Primero carga en la ficha de la propiedad la cuenta o referencia del servicio. Despues entra a Facturas, carga un archivo o configura una bandeja IMAP con reglas por remitente/asunto. Cuando el texto detectado incluye esa referencia, el sistema vincula la factura a la propiedad."
  }
];

function FloatingHelpWidget() {
  const [open, setOpen] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState(helpTopics[0].question);
  const [query, setQuery] = useState("");
  const selected = helpTopics.find((topic) => topic.question === selectedQuestion) ?? helpTopics[0];
  const filtered = helpTopics.filter((topic) => {
    const needle = query.trim().toLowerCase();
    return !needle || `${topic.category} ${topic.question} ${topic.answer}`.toLowerCase().includes(needle);
  });

  const quickFlow = [
    "Crear o revisar propiedad, propietario, inquilino y contrato.",
    "Completar garantia, regimen, titulares y fecha de reajuste.",
    "Guardar alerta de reajuste o calcular y enviar aviso de aumento.",
    "Cargar deuda manual, convertir factura en deuda o cobrar alquileres.",
    "Registrar pago total, parcial o saldo a favor indicando que titular pago.",
    "Si hubo error administrativo, corregir imputacion sin tocar Caja.",
    "Revisar Caja para ver entrada o salida de dinero.",
    "Consultar Cobranza realizada, Deudores, Comision/IVA o Saldos segun el control que necesites.",
    "Generar liquidacion del periodo, revisar comision bancaria y descargar PDFs."
  ];

  return (
    <div className="fixed bottom-24 right-5 z-40 flex flex-col items-end gap-3">
      {open && (
        <section className="w-[calc(100vw-2rem)] max-w-[28rem] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="rounded-md bg-brand p-2 text-white">
                <MessageCircle className="h-4 w-4" />
              </span>
              <div>
                <h3 className="font-semibold text-ink">Ayuda del sistema</h3>
                <p className="text-xs text-muted">Selecciona una pregunta</p>
              </div>
            </div>
            <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Cerrar ayuda">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[min(42rem,calc(100vh-9rem))] overflow-auto p-4">
            <div className="rounded-lg border border-slate-100 bg-white p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 rounded-md bg-teal-50 p-2 text-brand">
                  <HelpCircle className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">{selected.category}</p>
                  <h4 className="mt-1 font-semibold text-ink">{selected.question}</h4>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{selected.answer}</p>
                </div>
              </div>
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs leading-5 text-amber-900">
                IRPF, IVA, DGI y criterios contables deben validarse con contador o escribano.
              </div>
            </div>

            <div className="mt-4">
              <p className="text-sm font-semibold text-ink">Preguntas frecuentes</p>
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input className="input pl-9" placeholder="Buscar por pagos, caja o facturas" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
              <div className="mt-3 grid gap-2">
                {filtered.map((topic) => {
                  const active = selected.question === topic.question;
                  return (
                    <button
                      key={topic.question}
                      className={`w-full rounded-md border px-3 py-2.5 text-left transition ${
                        active ? "border-brand bg-teal-50 text-ink" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                      onClick={() => setSelectedQuestion(topic.question)}
                    >
                      <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-brand">{topic.category}</span>
                      <span className="mt-0.5 block text-sm font-semibold leading-5">{topic.question}</span>
                    </button>
                  );
                })}
                {!filtered.length && <EmptyState title="Sin resultados" detail="Proba buscar por pagos, caja, facturas o liquidacion." />}
              </div>
            </div>

            <details className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-ink">Ver flujo rapido</summary>
              <div className="mt-3 space-y-2">
                {quickFlow.map((step, index) => (
                  <div key={step} className="flex gap-2 rounded-md border border-slate-100 bg-white p-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand text-xs font-semibold text-white">{index + 1}</span>
                    <p className="text-xs leading-5 text-slate-700">{step}</p>
                  </div>
                ))}
              </div>
            </details>
          </div>
        </section>
      )}
      <button
        className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-3 text-sm font-semibold text-white shadow-2xl transition hover:bg-teal-800"
        onClick={() => setOpen(!open)}
        aria-label="Abrir ayuda"
      >
        {open ? <X className="h-5 w-5" /> : <HelpCircle className="h-5 w-5" />}
        {open ? "Cerrar ayuda" : "Ayuda"}
      </button>
    </div>
  );
}

function Metric({ title, value, icon: Icon, tone }: { title: string; value: string; icon: typeof Home; tone: string }) {
  const tones: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700",
    rose: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
    green: "bg-emerald-50 text-emerald-700",
    slate: "bg-slate-100 text-slate-700"
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-panel">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted">{title}</p>
        <span className={`rounded-md p-2 ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-panel">
      <div className="flex items-center justify-between border-b border-slate-100 p-4">
        <h3 className="font-semibold text-ink">{title}</h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function CollapsiblePanel({
  title,
  subtitle,
  action,
  open,
  onToggle,
  children
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <button className="group flex min-w-0 flex-1 items-center justify-between gap-4 text-left" onClick={onToggle}>
          <span>
            <span className="block font-semibold text-ink">{title}</span>
            {subtitle && <span className="block text-sm text-muted">{subtitle}</span>}
          </span>
          <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition group-hover:bg-slate-100">
            {open ? "Ocultar" : "Mostrar"}
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </span>
        </button>
        {action}
      </div>
      {open && <div className="border-t border-slate-100 p-4">{children}</div>}
    </section>
  );
}

const PAGE_SIZE = 10;

function includesText(value: string, query: string) {
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

function inDateRange(value: string, from: string, to: string) {
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
}

function usePaged<T>(items: T[], pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  useEffect(() => setPage(1), [items.length, pageSize]);
  return {
    page: safePage,
    setPage,
    totalPages,
    pageItems: items.slice((safePage - 1) * pageSize, safePage * pageSize)
  };
}

function Pagination({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (page: number) => void }) {
  if (total <= PAGE_SIZE) return null;
  const startPage = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pageNumbers = Array.from({ length: Math.min(5, totalPages) }, (_, index) => startPage + index).filter((item) => item <= totalPages);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-muted">
      <span>{total} registros · pág. {page}/{totalPages}</span>
      <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
        <button className="rounded-full px-2 py-1 text-slate-500 transition hover:bg-white hover:text-ink disabled:opacity-40" onClick={() => onPage(1)} disabled={page <= 1}>«</button>
        <button className="rounded-full px-2 py-1 text-slate-500 transition hover:bg-white hover:text-ink disabled:opacity-40" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1}>‹</button>
        {pageNumbers.map((item) => (
          <button
            key={item}
            className={`min-w-8 rounded-full px-2.5 py-1 text-sm font-semibold transition ${
              item === page ? "bg-brand text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-ink"
            }`}
            onClick={() => onPage(item)}
          >
            {item}
          </button>
        ))}
        <button className="rounded-full px-2 py-1 text-slate-500 transition hover:bg-white hover:text-ink disabled:opacity-40" onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>›</button>
        <button className="rounded-full px-2 py-1 text-slate-500 transition hover:bg-white hover:text-ink disabled:opacity-40" onClick={() => onPage(totalPages)} disabled={page >= totalPages}>»</button>
      </div>
    </div>
  );
}

function ListTabs<T extends string>({
  tabs,
  active,
  onChange
}: {
  tabs: Array<{ id: T; label: string; count?: number; detail?: string }>;
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-flex min-w-max gap-1 rounded-full border border-slate-200 bg-slate-100/80 p-1">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                isActive ? "bg-white text-brand shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:bg-white/70 hover:text-ink"
              }`}
              onClick={() => onChange(tab.id)}
            >
              {tab.label}
              {typeof tab.count === "number" && (
                <span className={`rounded-full px-2 py-0.5 text-xs ${isActive ? "bg-teal-50 text-brand" : "bg-white/80 text-slate-500"}`}>
                  {tab.count}
                </span>
              )}
              {tab.detail && <span className="text-xs text-muted">{tab.detail}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChargesView({
  charges,
  allCharges,
  ownerCharges,
  cashMovements,
  statusFilter,
  search,
  setStatusFilter,
  setSearch,
  onNewTenantCharge,
  onNewOwnerCharge,
  onNewTenantCredit,
  onNewOwnerCredit,
  onBulkMonthly,
  onPay,
  onReminder,
  onLink,
  onEdit,
  onDelete,
  onVoidOwnerCharge
}: {
  charges: Charge[];
  allCharges: Charge[];
  ownerCharges: OwnerCharge[];
  cashMovements: CashMovement[];
  statusFilter: string;
  search: string;
  setStatusFilter: (value: string) => void;
  setSearch: (value: string) => void;
  onNewTenantCharge: () => void;
  onNewOwnerCharge: () => void;
  onNewTenantCredit: () => void;
  onNewOwnerCredit: () => void;
  onBulkMonthly: () => Promise<void>;
  onPay: (charge: Charge) => void;
  onReminder: (charge: Charge) => void;
  onLink: (charge: Charge) => void;
  onEdit: (charge: Charge) => void;
  onDelete: (charge: Charge) => void;
  onVoidOwnerCharge: (ownerCharge: OwnerCharge) => Promise<void>;
}) {
  const [activePanel, setActivePanel] = useState<"tenant" | "owner" | "chronological">("tenant");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const datedCharges = charges.filter((charge) => inDateRange(charge.due_date, fromDate, toDate));
  const paged = usePaged(datedCharges);
  const tenantOpenTotal = allCharges
    .filter((charge) => charge.status !== "pagado")
    .reduce((sum, charge) => sum + charge.remaining_amount, 0);
  const ownerPendingTotal = ownerCharges
    .filter((charge) => charge.status !== "anulado")
    .reduce((sum, charge) => sum + charge.amount, 0);
  const overdueRentCount = allCharges.filter(
    (charge) => charge.concept === "ALQUILER" && charge.status !== "pagado" && charge.due_date <= todayIso()
  ).length;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        <DebtActionButton
          title="Nueva deuda inquilino"
          detail="UTE, OSE, alquiler, gastos comunes"
          icon={Plus}
          tone="brand"
          onClick={onNewTenantCharge}
        />
        <DebtActionButton
          title="Nueva deuda propietario"
          detail="Primaria, tributos, arreglos, servicios"
          icon={WalletCards}
          tone="rose"
          onClick={onNewOwnerCharge}
        />
        <DebtActionButton
          title="Nuevo crédito inquilino"
          detail="saldo a favor / pago sin imputar"
          icon={CreditCard}
          tone="green"
          onClick={onNewTenantCredit}
        />
        <DebtActionButton
          title="Nuevo crédito propietario"
          detail="ajuste positivo en liquidación"
          icon={CreditCard}
          tone="blue"
          onClick={onNewOwnerCredit}
        />
        <DebtActionButton
          title="Historial propietarios"
          detail={`${ownerCharges.length} débitos · ${formatCurrency(ownerPendingTotal)}`}
          icon={Users}
          tone="slate"
          active={activePanel === "owner"}
          onClick={() => setActivePanel("owner")}
        />
        <DebtActionButton
          title="Historial inquilinos"
          detail={`${allCharges.length} deudas · abierto ${formatCurrency(tenantOpenTotal)}`}
          icon={UserRound}
          tone="blue"
          active={activePanel === "tenant"}
          onClick={() => setActivePanel("tenant")}
        />
        <DebtActionButton
          title="Historial cronológico"
          detail={`${overdueRentCount} alquiler(es) vencidos hoy`}
          icon={CalendarDays}
          tone="green"
          active={activePanel === "chronological"}
          onClick={() => setActivePanel("chronological")}
        />
      </div>

      {activePanel === "tenant" && (
        <>
          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-panel xl:flex-row xl:items-center xl:justify-between">
            <div className="grid flex-1 gap-3 md:grid-cols-[1.2fr_0.8fr_0.7fr_0.7fr]">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input className="input pl-9" placeholder="Buscar inquilino, propiedad o concepto" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
              <select className="input sm:w-52" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="todas">Todas</option>
                <option value="vencido">Vencidas</option>
                <option value="parcial">Parciales</option>
                <option value="pendiente">Pendientes</option>
                <option value="pagado">Pagadas</option>
              </select>
              <input className="input" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
              <input className="input" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
            </div>
            <button className="btn-secondary" onClick={onBulkMonthly}>
              <CalendarDays className="h-4 w-4" />
              Generar alquileres del mes
            </button>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white shadow-panel">
            {datedCharges.length ? (
              <div className="divide-y divide-slate-100">
                {paged.pageItems.map((charge) => (
                  <ChargeRow
                    key={charge.id}
                    charge={charge}
                    onPay={onPay}
                    onReminder={onReminder}
                    onLink={onLink}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            ) : (
              <div className="p-4">
                <EmptyState title="No hay deudas para este filtro" detail="Probá cambiar el estado o la búsqueda." />
              </div>
            )}
            <Pagination page={paged.page} totalPages={paged.totalPages} total={datedCharges.length} onPage={paged.setPage} />
          </div>
        </>
      )}

      {activePanel === "owner" && <OwnerDebtHistory ownerCharges={ownerCharges} onVoidOwnerCharge={onVoidOwnerCharge} />}

      {activePanel === "chronological" && (
        <ChronologicalDebtHistory charges={allCharges} ownerCharges={ownerCharges} cashMovements={cashMovements} />
      )}
    </div>
  );
}

function DebtActionButton({
  title,
  detail,
  icon: Icon,
  tone,
  active = false,
  onClick
}: {
  title: string;
  detail: string;
  icon: typeof Home;
  tone: "brand" | "blue" | "green" | "rose" | "slate";
  active?: boolean;
  onClick: () => void;
}) {
  const tones: Record<string, string> = {
    brand: "border-brand bg-teal-50 text-brand",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    slate: "border-slate-200 bg-white text-slate-700"
  };
  return (
    <button
      className={`rounded-xl border p-4 text-left shadow-panel transition hover:-translate-y-0.5 hover:shadow-lg ${tones[tone]} ${active ? "ring-2 ring-brand/25" : ""}`}
      onClick={onClick}
    >
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white/80">
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-5 opacity-80">{detail}</p>
    </button>
  );
}

function OwnerDebtHistory({ ownerCharges, onVoidOwnerCharge }: { ownerCharges: OwnerCharge[]; onVoidOwnerCharge: (ownerCharge: OwnerCharge) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("todos");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const visible = ownerCharges.filter((item) => {
    const matchesStatus = status === "todos" || item.status === status;
    const matchesDate = inDateRange(item.charge_date, fromDate, toDate);
    const matchesText = !query || includesText(`${item.owner_legacy_code} ${item.owner_name} ${item.property_reference} ${item.property_address} ${item.concept} ${item.description}`, query);
    return matchesStatus && matchesDate && matchesText;
  });
  const paged = usePaged(visible);
  return (
    <Panel title="Historial de deudas de propietarios" action={<span className="text-sm text-muted">{visible.length} resultado(s)</span>}>
      <div className="mb-3 grid gap-2 md:grid-cols-4 xl:grid-cols-5">
        <div className="relative md:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Buscar propietario, finca o concepto" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <select className="input" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="todos">Todos los estados</option>
          <option value="pendiente">Pendientes</option>
          <option value="anulado">Anulados</option>
        </select>
        <input className="input" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        <input className="input" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
      </div>
      {visible.length ? (
        <div className="divide-y divide-slate-100">
          {paged.pageItems.map((item) => (
            <div key={item.id} className="grid gap-3 py-3 lg:grid-cols-[1fr_auto_auto_auto_auto] lg:items-center">
              <div>
                <p className="font-semibold text-ink">Prop {item.owner_legacy_code || "s/n"} - {item.owner_name}</p>
                <p className="text-sm text-muted">Fin {item.property_reference || "s/n"} - {item.property_address || "Sin dirección"} · {item.concept}</p>
                <p className="text-xs text-muted">Liq. {item.period || "sin período"}{item.period_from || item.period_to ? ` · Período ${item.period_from || "?"} a ${item.period_to || "?"}` : ""}</p>
                <p className="mt-1 text-xs text-muted">{item.description || "Sin descripción"} · creado {formatDateTime(item.created_at)}</p>
              </div>
              <span className="rounded-md bg-rose-50 px-2 py-1 text-sm font-semibold text-rose-700">{formatCurrency(item.amount)}</span>
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{item.paid_by_agency ? "Con salida de caja" : "Solo liquidación"}</span>
              <span className={`rounded-md px-2 py-1 text-xs font-semibold ${item.status === "anulado" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>{item.status}</span>
              <button className="icon-action" title="Anular débito propietario" onClick={() => onVoidOwnerCharge(item)} disabled={item.status === "anulado"}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="Sin débitos de propietario para este filtro" detail="Usá Nueva deuda propietario para cargar gastos asociados a una finca." />
      )}
      <Pagination page={paged.page} totalPages={paged.totalPages} total={visible.length} onPage={paged.setPage} />
    </Panel>
  );
}

function ChronologicalDebtHistory({
  charges,
  ownerCharges,
  cashMovements
}: {
  charges: Charge[];
  ownerCharges: OwnerCharge[];
  cashMovements: CashMovement[];
}) {
  const monthStart = `${currentPeriod()}-01`;
  const [query, setQuery] = useState("");
  const [eventType, setEventType] = useState("todos");
  const [fromDate, setFromDate] = useState(monthStart);
  const [toDate, setToDate] = useState(todayIso());
  const events = [
    ...charges.map((charge) => ({
      key: `tenant-${charge.id}`,
      date: charge.due_date,
      type: "vencimiento",
      label: "Vence deuda inquilino",
      person: chargeTenantLabel(charge),
      detail: `${charge.concept} · ${chargePropertyLabel(charge)} · ${charge.status}`,
      amount: charge.remaining_amount || charge.amount,
      tone: charge.status === "pagado" ? "emerald" : charge.status === "vencido" ? "rose" : "amber"
    })),
    ...ownerCharges.map((charge) => ({
      key: `owner-${charge.id}`,
      date: charge.charge_date,
      type: "propietario",
      label: "Débito propietario",
      person: `Prop ${charge.owner_legacy_code || "s/n"} - ${charge.owner_name}`,
      detail: `${charge.concept} · Fin ${charge.property_reference || "s/n"} - ${charge.property_address || "Sin dirección"} · ${charge.status}`,
      amount: charge.amount,
      tone: "slate"
    })),
    ...cashMovements
      .filter((movement) => movement.origin === "payment" || movement.origin === "payment_adjustment")
      .map((movement) => ({
        key: `cash-${movement.id}`,
        date: movement.movement_date,
        type: "pago",
        label: movement.movement_type === "entrada" ? "Pago registrado" : "Ajuste de pago",
        person: cashMovementPersonLabel(movement),
        detail: `${movement.concept} · Fin ${movement.property_reference || "s/n"} - ${movement.property_address || "Sin dirección"} · ${movement.origin} · ${movement.status}`,
        amount: movement.amount,
        tone: movement.movement_type === "entrada" ? "emerald" : "rose"
      }))
  ];
  const visible = events
    .filter((event) => {
      const matchesType = eventType === "todos" || event.type === eventType;
      const matchesDate = inDateRange(event.date, fromDate, toDate);
      const matchesText = !query || includesText(`${event.label} ${event.person} ${event.detail}`, query);
      return matchesType && matchesDate && matchesText;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  const paged = usePaged(visible);
  const rentDue = charges.filter((charge) => charge.concept === "ALQUILER" && charge.status !== "pagado" && inDateRange(charge.due_date, fromDate, toDate));
  return (
    <Panel title="Historial cronológico de deuda" action={<span className="text-sm text-muted">día por día: vencimientos, pagos y débitos</span>}>
      <div className="mb-3 rounded-md border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
        Para revisar “del 1 al 10”, cargá esas fechas en Desde/Hasta. “Alquileres pendientes en rango” son alquileres con vencimiento dentro de esas fechas que todavía no figuran pagados.
      </div>
      <div className="mb-3 grid gap-2 md:grid-cols-4 xl:grid-cols-5">
        <div className="relative md:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Buscar persona, finca, concepto o evento" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <select className="input" value={eventType} onChange={(event) => setEventType(event.target.value)}>
          <option value="todos">Todos los eventos</option>
          <option value="vencimiento">Vencimientos inquilino</option>
          <option value="pago">Pagos registrados</option>
          <option value="propietario">Débitos propietario</option>
        </select>
        <input className="input" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        <input className="input" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
      </div>
      <div className="mb-3 grid gap-3 md:grid-cols-3">
        <div className="rounded-md bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Eventos</p>
          <p className="mt-1 text-lg font-semibold text-ink">{visible.length}</p>
        </div>
        <div className="rounded-md bg-amber-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">Alquileres pendientes en rango</p>
          <p className="mt-1 text-lg font-semibold text-amber-900">{rentDue.length}</p>
        </div>
        <div className="rounded-md bg-rose-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-rose-700">Saldo alquiler pendiente</p>
          <p className="mt-1 text-lg font-semibold text-rose-900">{formatCurrency(rentDue.reduce((sum, charge) => sum + charge.remaining_amount, 0))}</p>
        </div>
      </div>
      {visible.length ? (
        <div className="divide-y divide-slate-100">
          {paged.pageItems.map((event) => (
            <div key={event.key} className="grid gap-3 py-3 lg:grid-cols-[120px_1fr_auto] lg:items-center">
              <span className="rounded-md bg-slate-100 px-2 py-1 text-sm font-semibold text-slate-700">{event.date}</span>
              <div>
                <p className="font-semibold text-ink">{event.label} · {event.person}</p>
                <p className="text-sm text-muted">{event.detail}</p>
              </div>
              <span className={`rounded-md px-2 py-1 text-sm font-semibold ${event.tone === "emerald" ? "bg-emerald-50 text-emerald-700" : event.tone === "rose" ? "bg-rose-50 text-rose-700" : event.tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-700"}`}>
                {formatCurrency(event.amount)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="Sin eventos en este rango" detail="Cambiá fechas o filtros para ver pagos, vencimientos y débitos." />
      )}
      <Pagination page={paged.page} totalPages={paged.totalPages} total={visible.length} onPage={paged.setPage} />
    </Panel>
  );
}

function ChargeRow({
  charge,
  onPay,
  onReminder,
  onLink,
  onEdit,
  onDelete,
  compact = false
}: {
  charge: Charge;
  onPay: (charge: Charge) => void;
  onReminder: (charge: Charge) => void;
  onLink?: (charge: Charge) => void;
  onEdit?: (charge: Charge) => void;
  onDelete?: (charge: Charge) => void;
  compact?: boolean;
}) {
  return (
    <div className={`grid gap-3 p-4 ${compact ? "lg:grid-cols-[1fr_auto]" : "xl:grid-cols-[1.5fr_1fr_1fr_auto]"}`}>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={charge.status} />
	          <p className="font-semibold text-ink">{chargeTenantLabel(charge)}</p>
        </div>
        <p className="mt-1 text-sm text-muted">{chargePropertyLabel(charge)}</p>
	        <p className="mt-1 text-sm text-muted">{charge.description || charge.concept} · Período {chargePeriodLabel(charge)}</p>
        {charge.consumption_period_start && charge.consumption_period_end && (
          <p className="mt-1 text-xs text-muted">
            Consumo {charge.consumption_period_start} a {charge.consumption_period_end}
            {charge.proration_total_days ? ` · días cobrados ${charge.proration_days}/${charge.proration_total_days}` : ""}
          </p>
        )}
      </div>
      {!compact && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Concepto</p>
          <p className="mt-1 font-medium text-ink">{charge.concept}</p>
	          <p className="text-sm text-muted">Período {chargePeriodLabel(charge)} · vence {charge.due_date}</p>
          <p className="text-xs text-muted">Dev. {charge.accrual_period || charge.period} · Liq. {charge.settlement_period || charge.period}</p>
        </div>
      )}
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Saldo</p>
        <p className="mt-1 text-lg font-semibold text-ink">{formatCurrency(charge.remaining_amount)}</p>
	        <p className="text-sm text-muted">pagado {formatCurrency(charge.paid_amount)} de {formatCurrency(charge.amount)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {charge.status !== "pagado" && (
          <button className="icon-action" title="Registrar pago" onClick={() => onPay(charge)}>
            <Banknote className="h-4 w-4" />
          </button>
        )}
        <button className="icon-action" title="Recordatorio" onClick={() => onReminder(charge)}>
          <MessageCircle className="h-4 w-4" />
        </button>
        {charge.tenant_email && (
          <a
            className="icon-action"
            title="Enviar correo"
            href={`mailto:${charge.tenant_email}?subject=${encodeURIComponent(`Aviso de deuda ${charge.concept}`)}&body=${encodeURIComponent(`Hola ${charge.tenant_name}, te recordamos la deuda ${charge.concept} por ${formatCurrency(charge.remaining_amount)} correspondiente a ${chargePropertyLabel(charge)}.`)}`}
          >
            <Send className="h-4 w-4" />
          </a>
        )}
        {onLink && (
          <button className="icon-action" title="Visualizar / link público" onClick={() => onLink(charge)}>
            <LinkIcon className="h-4 w-4" />
          </button>
        )}
        {onEdit && (
          <button className="icon-action" title="Editar deuda" onClick={() => onEdit(charge)}>
            <Edit3 className="h-4 w-4" />
          </button>
        )}
        {onDelete && (
          <button className="icon-action" title="Eliminar deuda" onClick={() => onDelete(charge)}>
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function InvoicesView({
  invoices,
  inboxes,
  setup,
  onImport,
  onCreateCharge,
  onDeleteInvoice,
  onCreateInbox,
  onCreateRule,
  onScanInbox
}: {
  invoices: InvoiceDocument[];
  inboxes: EmailInboxConfig[];
  setup: EmailSetupStatus | null;
  onRefresh: () => Promise<void>;
  onImport: (file: File) => Promise<void>;
  onCreateCharge: (invoice: InvoiceDocument) => Promise<void>;
  onDeleteInvoice: (invoice: InvoiceDocument) => Promise<void>;
  onCreateInbox: (payload: unknown) => Promise<void>;
  onCreateRule: (inboxId: number, payload: unknown) => Promise<void>;
  onScanInbox: (inboxId: number) => Promise<{ run: EmailImportRun; invoices: InvoiceDocument[] }>;
}) {
  const [statusFilter, setStatusFilter] = useState("todos");
  const [providerFilter, setProviderFilter] = useState("todos");
  const [sourceFilter, setSourceFilter] = useState("todos");
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [scanningId, setScanningId] = useState<number | null>(null);
  const [lastScan, setLastScan] = useState<EmailImportRun | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [inboxForm, setInboxForm] = useState({
    name: "Correo facturas",
    email_address: "",
    host: "imap.gmail.com",
    port: 993,
    username: "",
    secret_env_var: "FACTURAS_EMAIL_PASSWORD",
    folder: "INBOX"
  });
  const [ruleForm, setRuleForm] = useState({
    inbox_id: 0,
    provider: "UTE",
    sender_pattern: "",
    subject_keywords: ""
  });
  const secretEnvVarLooksValid = /^[A-Za-z_][A-Za-z0-9_]*$/.test(inboxForm.secret_env_var);
  const visible = invoices.filter((invoice) => {
    const matchesStatus = statusFilter === "todos" || invoice.status === statusFilter;
    const matchesProvider = providerFilter === "todos" || invoice.provider === providerFilter;
    const matchesSource = sourceFilter === "todos" || invoice.source === sourceFilter;
    const matchesDate = inDateRange(invoice.due_date, fromDate, toDate);
    const matchesText = !query || includesText(`${invoice.provider} ${invoice.account_number} ${invoice.property_reference} ${invoice.property_address}`, query);
    return matchesStatus && matchesProvider && matchesSource && matchesDate && matchesText;
  });
  const paged = usePaged(visible);
  const pending = invoices.filter((invoice) => invoice.status === "pendiente").length;
  const automated = invoices.filter((invoice) => invoice.source === "email").length;

  async function importFile(file: File) {
    setLoading(true);
    try {
      await onImport(file);
    } finally {
      setLoading(false);
    }
  }

  async function submitInbox(event: FormEvent) {
    event.preventDefault();
    if (!secretEnvVarLooksValid) {
      setLastScan({
        id: 0,
        inbox_id: 0,
        status: "config_pendiente",
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        messages_seen: 0,
        invoices_created: 0,
        notes: "En Variable de clave va FACTURAS_EMAIL_PASSWORD, no la contraseña real."
      });
      return;
    }
    await onCreateInbox({ ...inboxForm, provider: "imap", active: true });
    setRuleForm((current) => ({ ...current, inbox_id: 0 }));
  }

  async function submitRule(event: FormEvent) {
    event.preventDefault();
    const inboxId = ruleForm.inbox_id || inboxes[0]?.id;
    if (!inboxId) return;
    await onCreateRule(inboxId, {
      provider: ruleForm.provider,
      sender_pattern: ruleForm.sender_pattern,
      subject_keywords: ruleForm.subject_keywords,
      active: true
    });
    setRuleForm((current) => ({ ...current, sender_pattern: "", subject_keywords: "" }));
  }

  async function scanInbox(inboxId: number) {
    setScanningId(inboxId);
    try {
      const result = await onScanInbox(inboxId);
      setLastScan(result.run);
    } finally {
      setScanningId(null);
    }
  }

  function useGmailDefaults() {
    setInboxForm({
      ...inboxForm,
      name: "Gmail facturas",
      host: "imap.gmail.com",
      port: 993,
      username: inboxForm.email_address,
      secret_env_var: "FACTURAS_EMAIL_PASSWORD",
      folder: "INBOX"
    });
  }

  const configuredInbox =
    inboxes.find((inbox) => inbox.active && setup?.email_address && (inbox.email_address === setup.email_address || inbox.username === setup.email_address)) ??
    inboxes.find((inbox) => inbox.active);
  const hasRules = inboxes.some((inbox) => inbox.rules.length > 0);
  const quickInbox = configuredInbox ?? inboxes[0];
  const setupSteps = [
    { label: "Correo configurado", done: setup?.has_inbox ?? Boolean(configuredInbox) },
    { label: "Clave cargada", done: setup?.has_secret ?? false },
    { label: "Regla creada", done: setup?.has_rules ?? hasRules },
    { label: "Correo no leído con PDF", done: false },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric title="Pendientes" value={String(pending)} icon={Bell} tone="rose" />
        <Metric title="Desde email" value={String(automated)} icon={FileImage} tone="blue" />
        <Metric title="Total facturas" value={String(invoices.length)} icon={ReceiptText} tone="slate" />
      </div>
      <Panel
        title="Correo automático de facturas"
        action={
          <button className="btn-secondary" onClick={() => setShowAdvanced(!showAdvanced)}>
            {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Configuración
          </button>
        }
      >
        <div className="mb-4 grid gap-3 lg:grid-cols-4">
          {setupSteps.map((step, index) => (
            <div key={step.label} className={`rounded-lg border p-3 ${step.done ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
              <p className={`text-xs font-semibold ${step.done ? "text-emerald-700" : "text-muted"}`}>Paso {index + 1}</p>
              <p className="mt-1 font-semibold text-ink">{step.label}</p>
            </div>
          ))}
        </div>
        <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_auto]">
          <div className={`rounded-lg border p-4 ${setup?.ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <p className="font-semibold text-ink">Prueba rápida</p>
            <p className="mt-1 text-sm text-muted">
              Correo: {setup?.email_address || quickInbox?.email_address || "sin correo"} · Carpeta: {setup?.folder || quickInbox?.folder || "INBOX"}
            </p>
            <p className="mt-1 text-sm text-muted">
              Mandá un email no leído con asunto "factura UTE" y un PDF adjunto. Después tocá revisar.
            </p>
            {!setup?.has_secret && (
              <p className="mt-2 text-sm font-semibold text-amber-800">
                Falta pegar la app-password en backend/.env: {setup?.secret_env_var || "FACTURAS_EMAIL_PASSWORD"}="..."
              </p>
            )}
          </div>
          <button className="btn-primary justify-center px-6" onClick={() => quickInbox && scanInbox(quickInbox.id)} disabled={!quickInbox || scanningId === quickInbox.id}>
            {scanningId === quickInbox?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Revisar correo
          </button>
        </div>
        {lastScan && (
          <div className={`mb-4 rounded-lg border p-4 text-sm ${lastScan.status === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
            <p className="font-semibold">Resultado: {lastScan.status}</p>
            <p className="mt-1">Correos revisados: {lastScan.messages_seen} · Facturas creadas: {lastScan.invoices_created}</p>
            {lastScan.notes && <p className="mt-1">{lastScan.notes}</p>}
          </div>
        )}
        {showAdvanced && (
        <>
        <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
          <form className="grid gap-3 rounded-lg border border-slate-200 p-3" onSubmit={submitInbox}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-ink">1. Bandeja central</p>
                <p className="text-sm text-muted">El campo de clave debe decir FACTURAS_EMAIL_PASSWORD, no la contraseña real.</p>
              </div>
              <button className="btn-secondary" type="button" onClick={useGmailDefaults}>Usar Gmail</button>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-ink">Nombre<input className="input" placeholder="Gmail facturas" value={inboxForm.name} onChange={(event) => setInboxForm({ ...inboxForm, name: event.target.value })} required /></label>
              <label className="grid gap-1 text-sm font-medium text-ink">Correo<input className="input" placeholder="tu-correo@gmail.com" value={inboxForm.email_address} onChange={(event) => setInboxForm({ ...inboxForm, email_address: event.target.value, username: event.target.value })} required /></label>
              <label className="grid gap-1 text-sm font-medium text-ink">Host IMAP<input className="input" placeholder="imap.gmail.com" value={inboxForm.host} onChange={(event) => setInboxForm({ ...inboxForm, host: event.target.value })} /></label>
              <label className="grid gap-1 text-sm font-medium text-ink">Usuario<input className="input" placeholder="tu-correo@gmail.com" value={inboxForm.username} onChange={(event) => setInboxForm({ ...inboxForm, username: event.target.value })} /></label>
              <label className="grid gap-1 text-sm font-medium text-ink">Nombre de variable en backend/.env<input className="input" placeholder="FACTURAS_EMAIL_PASSWORD" value={inboxForm.secret_env_var} onChange={(event) => setInboxForm({ ...inboxForm, secret_env_var: event.target.value })} /></label>
              <label className="grid gap-1 text-sm font-medium text-ink">Carpeta<input className="input" placeholder="INBOX" value={inboxForm.folder} onChange={(event) => setInboxForm({ ...inboxForm, folder: event.target.value })} /></label>
            </div>
            {!secretEnvVarLooksValid && (
              <p className="rounded-md bg-amber-50 p-2 text-sm font-semibold text-amber-800">
                Parece que pegaste la contraseña. Acá debe ir solo FACTURAS_EMAIL_PASSWORD.
              </p>
            )}
            <button className="btn-primary justify-center" type="submit">
              <Plus className="h-4 w-4" />
              Guardar bandeja
            </button>
          </form>
          <form className="grid gap-3 rounded-lg border border-slate-200 p-3" onSubmit={submitRule}>
            <div>
              <p className="font-semibold text-ink">2. Regla de prueba</p>
              <p className="text-sm text-muted">Para probar con un correo enviado por vos, poné tu email como remitente y "factura" en asunto.</p>
            </div>
            <select className="input" value={ruleForm.inbox_id || inboxes[0]?.id || 0} onChange={(event) => setRuleForm({ ...ruleForm, inbox_id: Number(event.target.value) })}>
              {inboxes.length ? inboxes.map((inbox) => <option key={inbox.id} value={inbox.id}>{inbox.name} · {inbox.email_address}</option>) : <option value={0}>Primero guardá una bandeja</option>}
            </select>
            <div className="grid gap-2 md:grid-cols-3">
              <select className="input" value={ruleForm.provider} onChange={(event) => setRuleForm({ ...ruleForm, provider: event.target.value })}>
                <option value="UTE">UTE</option>
                <option value="OSE">OSE</option>
                <option value="GASTOS_COMUNES">Gastos comunes</option>
                <option value="TRIBUTOS">Tributos</option>
                <option value="SANEAMIENTO">Saneamiento</option>
              </select>
              <input className="input" placeholder="ej: jose@gmail.com o ute" value={ruleForm.sender_pattern} onChange={(event) => setRuleForm({ ...ruleForm, sender_pattern: event.target.value })} />
              <input className="input" placeholder="ej: factura" value={ruleForm.subject_keywords} onChange={(event) => setRuleForm({ ...ruleForm, subject_keywords: event.target.value })} />
            </div>
            <button className="btn-secondary justify-center" type="submit" disabled={!inboxes.length}>
              <Plus className="h-4 w-4" />
              Agregar regla
            </button>
          </form>
        </div>
        <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200 px-3">
          {inboxes.map((inbox) => (
            <div key={inbox.id} className="grid gap-3 py-3 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="font-semibold text-ink">{inbox.name} · {inbox.email_address}</p>
                <p className="text-sm text-muted">{inbox.host || "sin host"} · {inbox.folder} · ultima revision {inbox.last_checked_at || "sin revisar"}</p>
                <p className="mt-1 text-xs text-muted">
                  Reglas: {inbox.rules.length ? inbox.rules.map((rule) => `${rule.provider}${rule.sender_pattern ? ` (${rule.sender_pattern})` : ""}`).join(", ") : "sin reglas"}
                </p>
                <p className="mt-1 text-xs text-muted">Clave esperada en backend/.env: {inbox.secret_env_var}=********</p>
              </div>
              <button className="btn-primary justify-center" onClick={() => scanInbox(inbox.id)} disabled={scanningId === inbox.id}>
                {scanningId === inbox.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Revisar correo
              </button>
            </div>
          ))}
          {!inboxes.length && <EmptyState title="Sin correo configurado" detail="Registrá el correo central y luego agregá reglas de UTE, OSE o gastos comunes." />}
        </div>
        </>
        )}
      </Panel>
      <Panel
        title="Facturas capturadas"
        action={
          <label className="btn-primary cursor-pointer">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileImage className="h-4 w-4" />}
            Cargar factura local
            <input
              className="hidden"
              type="file"
              accept="application/pdf,image/*,.txt"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) importFile(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        }
      >
        <div className="mb-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          <div className="relative md:col-span-3 xl:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="input pl-9" placeholder="Buscar proveedor, cuenta o finca" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="todos">Todos los estados</option>
            <option value="pendiente">Pendientes</option>
            <option value="convertida">Convertidas</option>
            <option value="anulada">Anuladas</option>
            <option value="vencida">Vencidas</option>
          </select>
          <select className="input" value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)}>
            <option value="todos">Todos los proveedores</option>
            <option value="UTE">UTE</option>
            <option value="OSE">OSE</option>
            <option value="TRIBUTOS">Tributos</option>
            <option value="SANEAMIENTO">Saneamiento</option>
            <option value="OTROS">Otros</option>
          </select>
          <select className="input" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
            <option value="todos">Todas las fuentes</option>
            <option value="email">Email</option>
            <option value="manual">Manual</option>
          </select>
          <input className="input" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          <input className="input" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        </div>
        {visible.length ? (
          <div className="divide-y divide-slate-100">
            {paged.pageItems.map((invoice) => (
              <div key={invoice.id} className="grid gap-3 py-3 lg:grid-cols-[1fr_auto_auto_auto_auto] lg:items-center">
                <div>
                  <p className="font-semibold text-ink">{invoice.provider} · {invoice.account_number || "sin cuenta"}</p>
	                  <p className="text-sm text-muted">
	                    Fin {invoice.property_reference || "s/n"} - {invoice.property_address || "Sin dirección"} · vence {invoice.due_date} · {invoice.source} · responsable {invoice.responsible_type}
	                  </p>
	                  {(invoice.consumption_period_start || invoice.reference_number || invoice.meter_number) && (
	                    <p className="mt-1 text-xs text-muted">
	                      {invoice.consumption_period_start && invoice.consumption_period_end ? `Consumo ${invoice.consumption_period_start} a ${invoice.consumption_period_end}` : ""}
	                      {invoice.reference_number ? ` · Ref ${invoice.reference_number}` : ""}
	                      {invoice.meter_number ? ` · Medidor ${invoice.meter_number}` : ""}
	                      {invoice.consumption_amount ? ` · ${invoice.consumption_amount} ${invoice.consumption_unit}` : ""}
	                    </p>
	                  )}
	                </div>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-sm font-semibold text-slate-700">{formatCurrency(invoice.amount)}</span>
                <span className={`rounded-md px-2 py-1 text-xs font-semibold ${invoice.status === "pendiente" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{invoice.status}</span>
                <button className="btn-secondary justify-center" onClick={() => onCreateCharge(invoice)} disabled={Boolean(invoice.charge_id || invoice.owner_charge_id || !invoice.property_id || invoice.status === "anulada")}>
                  <Plus className="h-4 w-4" />
                  Crear cargo
                </button>
                <button className="icon-action" title="Eliminar o anular factura" onClick={() => onDeleteInvoice(invoice)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Sin facturas para este filtro" detail="Importá PDFs o configurá el correo central para procesarlas automáticamente." />
        )}
        <Pagination page={paged.page} totalPages={paged.totalPages} total={visible.length} onPage={paged.setPage} />
      </Panel>
    </div>
  );
}

function TenantsView({
  people,
  owners,
  getOpenCharges,
  onNew,
  onEdit,
  onDelete,
  onDetail,
  onReminder,
  onLink,
  onPayGroup
}: {
  people: Person[];
  owners: Person[];
  getOpenCharges: (personId: number) => Charge[];
  onNew: () => void;
  onEdit: (person: Person) => void;
  onDelete: (person: Person) => void;
  onDetail: (person: Person) => void;
  onReminder: (person: Person) => void;
  onLink: (person: Person) => void;
  onPayGroup: (person: Person) => void;
}) {
  const [activePanel, setActivePanel] = useState<"directory" | "collections" | "debtors" | "ownerDebtors">("directory");
  const [query, setQuery] = useState("");
  const [debtFilter, setDebtFilter] = useState("todos");
  const [sortBy, setSortBy] = useState("codigo_desc");
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const visible = [...people]
    .filter((person) => {
      const openItems = getOpenCharges(person.id);
      const matchesText = !query || includesText(`${person.full_name} ${person.document} ${person.mobile} ${person.email} ${person.legacy_code}`, query);
      const matchesDebt =
        debtFilter === "todos" ||
        (debtFilter === "con_deuda" && person.total_debt > 0) ||
        (debtFilter === "vencida" && person.overdue_debt > 0) ||
        (debtFilter === "sin_deuda" && openItems.length === 0);
      return matchesText && matchesDebt;
    })
    .sort((a, b) => {
      const codeA = legacyCodeValue(a.legacy_code || "0");
      const codeB = legacyCodeValue(b.legacy_code || "0");
      if (sortBy === "codigo_asc") return codeA > codeB ? 1 : codeA < codeB ? -1 : 0;
      if (sortBy === "codigo_desc") return codeA < codeB ? 1 : codeA > codeB ? -1 : 0;
      if (sortBy === "fecha_desc") return b.created_at.localeCompare(a.created_at);
      if (sortBy === "fecha_asc") return a.created_at.localeCompare(b.created_at);
      if (sortBy === "deuda_desc") return b.total_debt - a.total_debt;
      return a.full_name.localeCompare(b.full_name);
    });
  const paged = usePaged(visible);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <button className={activePanel === "directory" ? "btn-primary justify-center" : "btn-secondary justify-center"} onClick={() => setActivePanel("directory")}>
          <UserRound className="h-4 w-4" />
          Buscar inquilinos
        </button>
        <button className={activePanel === "collections" ? "btn-primary justify-center" : "btn-secondary justify-center"} onClick={() => setActivePanel("collections")}>
          <ReceiptText className="h-4 w-4" />
          Cobranza realizada
        </button>
        <button className={activePanel === "debtors" ? "btn-primary justify-center" : "btn-secondary justify-center"} onClick={() => setActivePanel("debtors")}>
          <ClipboardList className="h-4 w-4" />
          Inquilinos deudores
        </button>
        <button className={activePanel === "ownerDebtors" ? "btn-primary justify-center" : "btn-secondary justify-center"} onClick={() => setActivePanel("ownerDebtors")}>
          <Users className="h-4 w-4" />
          Deudores por propietario
        </button>
      </div>
      {activePanel === "collections" && <TenantCollectionsPanel tenants={people} />}
      {activePanel === "debtors" && <TenantDebtorsPanel tenants={people} />}
      {activePanel === "ownerDebtors" && <OwnerDebtorsPanel owners={owners} />}
      {activePanel === "directory" && (
      <>
      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-panel md:grid-cols-[1fr_220px_240px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Buscar nombre, código, documento o contacto" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <select className="input" value={debtFilter} onChange={(event) => setDebtFilter(event.target.value)}>
          <option value="todos">Todos</option>
          <option value="con_deuda">Con deuda</option>
          <option value="vencida">Con vencida</option>
          <option value="sin_deuda">Sin deuda</option>
        </select>
        <select className="input" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
          <option value="codigo_desc">Código mayor primero</option>
          <option value="codigo_asc">Código menor primero</option>
          <option value="fecha_desc">Creación más reciente</option>
          <option value="fecha_asc">Creación más antigua</option>
          <option value="nombre_asc">Nombre A-Z</option>
          <option value="deuda_desc">Mayor deuda</option>
        </select>
        <button className="btn-primary" onClick={onNew}>
          <Plus className="h-4 w-4" />
          Nuevo inquilino
        </button>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {paged.pageItems.map((person) => {
          const openItems = getOpenCharges(person.id);
          const isExpanded = Boolean(expanded[person.id]);
          return (
            <div key={person.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-panel">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-ink">{person.full_name}</h3>
                  <p className="mt-1 text-sm text-muted">{[person.legacy_code && `Código ${person.legacy_code}`, person.document || person.email || person.mobile].filter(Boolean).join(" · ")}</p>
                  <p className="mt-1 text-xs text-muted">Creado {formatDateTime(person.created_at)}</p>
                </div>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{openItems.length} abiertas</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-md bg-slate-50 p-3">
                  <p className="text-xs text-muted">Deuda</p>
                  <p className="font-semibold text-ink">{formatCurrency(person.total_debt)}</p>
                </div>
                <div className="rounded-md bg-rose-50 p-3">
                  <p className="text-xs text-rose-700">Vencido</p>
                  <p className="font-semibold text-rose-700">{formatCurrency(person.overdue_debt)}</p>
                </div>
              </div>
              <p className="mt-4 truncate text-sm text-muted">{person.mobile || person.email || "Sin contacto"}</p>
              {isExpanded && (
                <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-muted">
                  <p>Documento: {person.document || "sin dato"}</p>
                  <p>Email: {person.email || "sin dato"}</p>
                  <p>Teléfono: {person.mobile || person.phone || "sin dato"}</p>
                  <p>Fecha de creación: {formatDateTime(person.created_at)}</p>
                  <p>Deudas abiertas: {openItems.map((charge) => `${charge.concept} ${formatCurrency(charge.remaining_amount)}`).join(", ") || "ninguna"}</p>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="icon-action" title={isExpanded ? "Contraer" : "Expandir"} onClick={() => setExpanded({ ...expanded, [person.id]: !isExpanded })}>
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <button className="icon-action" title="Ver ficha" onClick={() => onDetail(person)}>
                  <Eye className="h-4 w-4" />
                </button>
                <button className="icon-action" title="Ingreso pago inquilino" onClick={() => onPayGroup(person)} disabled={!openItems.length}>
                  <Banknote className="h-4 w-4" />
                </button>
                <button className="icon-action" title="Recordar deuda" onClick={() => onReminder(person)} disabled={!openItems.length}>
                  <MessageCircle className="h-4 w-4" />
                </button>
                <button className="icon-action" title="Crear link público" onClick={() => onLink(person)} disabled={!openItems.length}>
                  <LinkIcon className="h-4 w-4" />
                </button>
                <button className="icon-action" title="Editar inquilino" onClick={() => onEdit(person)}>
                  <Edit3 className="h-4 w-4" />
                </button>
                <button className="icon-action" title="Eliminar inquilino" onClick={() => onDelete(person)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <Pagination page={paged.page} totalPages={paged.totalPages} total={visible.length} onPage={paged.setPage} />
      </>
      )}
    </div>
  );
}

function TenantCollectionsPanel({ tenants }: { tenants: Person[] }) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState(todayIso());
  const [tenantId, setTenantId] = useState("");
  const [rows, setRows] = useState<TenantCollectionReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const filteredTenants = tenants.filter((tenant) => tenant.person_type !== "owner");
  const paged = usePaged(rows);
  const totals = rows.reduce(
    (acc, row) => ({
      amount: acc.amount + row.amount,
      commission: acc.commission + row.commission,
      iva: acc.iva + row.iva
    }),
    { amount: 0, commission: 0, iva: 0 }
  );

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params: Record<string, string> = {};
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      if (tenantId) params.tenant_id = tenantId;
      setRows(await api.tenantCollectionsReport(params));
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo cargar cobranza");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Panel
      title="Cobranza realizada"
      action={<span className="text-sm text-muted">{rows.length} pago(s)</span>}
    >
      <div className="mb-4 grid gap-3 md:grid-cols-[160px_160px_1fr_auto]">
        <input className="input" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        <input className="input" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        <select className="input" value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
          <option value="">Todos los inquilinos</option>
          {filteredTenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>Inq {tenant.legacy_code || "s/n"} - {tenant.full_name}</option>
          ))}
        </select>
        <button className="btn-primary justify-center" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Filtrar
        </button>
      </div>
      {error && <p className="mb-3 rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <MiniMoney label="Cobrado" value={totals.amount} strong />
        <MiniMoney label="Comisión" value={totals.commission} />
        <MiniMoney label="IVA" value={totals.iva} />
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-muted">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Inquilino</th>
                <th className="px-3 py-2">Finca</th>
                <th className="px-3 py-2">Concepto</th>
                <th className="px-3 py-2 text-right">Importe</th>
                <th className="px-3 py-2 text-right">Comisión</th>
                <th className="px-3 py-2 text-right">IVA</th>
                <th className="px-3 py-2">Recibo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paged.pageItems.map((row) => (
                <tr key={`${row.payment_id}-${row.charge_id}`}>
                  <td className="px-3 py-2">{row.payment_date}</td>
                  <td className="px-3 py-2">Inq {row.tenant_legacy_code || "s/n"} - {row.tenant_name}</td>
                  <td className="px-3 py-2">Fin {row.property_reference || "s/n"} - {row.property_address || "Sin dirección"}</td>
                  <td className="px-3 py-2">{row.concept} · {row.accrual_period || row.period}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatCurrency(row.amount)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(row.commission)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(row.iva)}</td>
                  <td className="px-3 py-2">
                    <a className="btn-secondary text-xs" href={exportUrl(`/payments/${row.payment_id}/receipt.pdf`)}>
                      <ArrowDownToLine className="h-4 w-4" />
                      PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={paged.page} totalPages={paged.totalPages} total={rows.length} onPage={paged.setPage} />
        </div>
      ) : (
        <EmptyState title="Sin cobranzas" detail="Ajustá los filtros o registrá pagos de inquilinos." />
      )}
    </Panel>
  );
}

function TenantDebtorsPanel({ tenants }: { tenants: Person[] }) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState(todayIso());
  const [tenantId, setTenantId] = useState("");
  const [rows, setRows] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const paged = usePaged(rows);
  const total = rows.reduce((sum, row) => sum + row.remaining_amount, 0);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params: Record<string, string> = {};
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      if (tenantId) params.tenant_id = tenantId;
      setRows(await api.tenantDebtorsReport(params));
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo cargar deudores");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Panel title="Inquilinos deudores" action={<span className="text-sm text-muted">{formatCurrency(total)}</span>}>
      <div className="mb-4 grid gap-3 md:grid-cols-[160px_160px_1fr_auto_auto]">
        <input className="input" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        <input className="input" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        <select className="input" value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
          <option value="">Todos los inquilinos</option>
          {tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>Inq {tenant.legacy_code || "s/n"} - {tenant.full_name}</option>
          ))}
        </select>
        <button className="btn-primary justify-center" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Filtrar
        </button>
        <a className="btn-secondary justify-center" href={exportUrl("/reports/tenant-debtors.pdf")}>
          <ArrowDownToLine className="h-4 w-4" />
          PDF
        </a>
      </div>
      {error && <p className="mb-3 rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-muted">
              <tr>
                <th className="px-3 py-2">Vence</th>
                <th className="px-3 py-2">Inquilino</th>
                <th className="px-3 py-2">Finca</th>
                <th className="px-3 py-2">Concepto</th>
                <th className="px-3 py-2">Mes/año</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paged.pageItems.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2">{row.due_date}</td>
                  <td className="px-3 py-2">Inq {row.tenant_legacy_code || "s/n"} - {row.tenant_name}</td>
                  <td className="px-3 py-2">Fin {row.property_reference || "s/n"} - {row.property_address || "Sin dirección"}</td>
                  <td className="px-3 py-2">{row.concept}</td>
                  <td className="px-3 py-2">{row.accrual_period || row.period}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatCurrency(row.remaining_amount)}</td>
                  <td className="px-3 py-2"><StatusBadge status={row.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={paged.page} totalPages={paged.totalPages} total={rows.length} onPage={paged.setPage} />
        </div>
      ) : (
        <EmptyState title="Sin deudores" detail="No hay deudas abiertas para el filtro seleccionado." />
      )}
    </Panel>
  );
}

function OwnerDebtorsPanel({ owners }: { owners: Person[] }) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState(todayIso());
  const [ownerId, setOwnerId] = useState("");
  const [rows, setRows] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const paged = usePaged(rows);
  const total = rows.reduce((sum, row) => sum + row.remaining_amount, 0);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params: Record<string, string> = {};
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      if (ownerId) params.owner_id = ownerId;
      setRows(await api.tenantDebtorsReport(params));
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo cargar deudores por propietario");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Panel title="Inquilinos deudores por propietario" action={<span className="text-sm text-muted">{formatCurrency(total)}</span>}>
      <div className="mb-4 grid gap-3 md:grid-cols-[160px_160px_1fr_auto]">
        <input className="input" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        <input className="input" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        <select className="input" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
          <option value="">Todos los propietarios</option>
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>Prop {owner.legacy_code || "s/n"} - {owner.full_name}</option>
          ))}
        </select>
        <button className="btn-primary justify-center" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Filtrar
        </button>
      </div>
      {error && <p className="mb-3 rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-muted">
              <tr>
                <th className="px-3 py-2">Propietario</th>
                <th className="px-3 py-2">Inquilino</th>
                <th className="px-3 py-2">Finca</th>
                <th className="px-3 py-2">Concepto</th>
                <th className="px-3 py-2">Vence</th>
                <th className="px-3 py-2 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paged.pageItems.map((row) => {
                const ownerText = ((row as Charge & { owners?: Array<{ owner_name: string; owner_percentage: number }> }).owners ?? [])
                  .map((owner) => `${owner.owner_name} ${owner.owner_percentage}%`)
                  .join(", ");
                return (
                  <tr key={row.id}>
                    <td className="px-3 py-2">{ownerText || "Sin propietario"}</td>
                    <td className="px-3 py-2">Inq {row.tenant_legacy_code || "s/n"} - {row.tenant_name}</td>
                    <td className="px-3 py-2">Fin {row.property_reference || "s/n"} - {row.property_address || "Sin dirección"}</td>
                    <td className="px-3 py-2">{row.concept} · {row.accrual_period || row.period}</td>
                    <td className="px-3 py-2">{row.due_date}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatCurrency(row.remaining_amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={paged.page} totalPages={paged.totalPages} total={rows.length} onPage={paged.setPage} />
        </div>
      ) : (
        <EmptyState title="Sin deudores" detail="No hay saldos pendientes para el propietario o rango elegido." />
      )}
    </Panel>
  );
}

function OwnersView({
  people,
  properties,
  settlements,
  onNew,
  onEdit,
  onDelete
}: {
  people: Person[];
  properties: PropertyItem[];
  settlements: Settlement[];
  onNew: () => void;
  onEdit: (person: Person) => void;
  onDelete: (person: Person) => void;
}) {
  const [activePanel, setActivePanel] = useState<"directory" | "balances" | "rentsByDocument">("directory");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("codigo_desc");
  const visible = [...people]
    .filter((person) =>
      !query || includesText(`${person.full_name} ${person.document} ${person.mobile} ${person.email} ${person.legacy_code} ${person.bank_name} ${person.bank_account}`, query)
    )
    .sort((a, b) => {
      const codeA = legacyCodeValue(a.legacy_code || "0");
      const codeB = legacyCodeValue(b.legacy_code || "0");
      if (sortBy === "codigo_asc") return codeA > codeB ? 1 : codeA < codeB ? -1 : 0;
      if (sortBy === "codigo_desc") return codeA < codeB ? 1 : codeA > codeB ? -1 : 0;
      if (sortBy === "fecha_desc") return b.created_at.localeCompare(a.created_at);
      if (sortBy === "fecha_asc") return a.created_at.localeCompare(b.created_at);
      return a.full_name.localeCompare(b.full_name);
    });
  const paged = usePaged(visible);
  const ownedProperties = (ownerId: number) =>
    properties.filter((property) => property.owners.some((owner) => owner.id === ownerId));
  const ownerSettlement = (ownerId: number) =>
    settlements.find((settlement) => settlement.owner_id === ownerId);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <button className={activePanel === "directory" ? "btn-primary justify-center" : "btn-secondary justify-center"} onClick={() => setActivePanel("directory")}>
          <Users className="h-4 w-4" />
          Buscar propietarios
        </button>
        <button className={activePanel === "balances" ? "btn-primary justify-center" : "btn-secondary justify-center"} onClick={() => setActivePanel("balances")}>
          <WalletCards className="h-4 w-4" />
          Saldos de propietarios
        </button>
        <button className={activePanel === "rentsByDocument" ? "btn-primary justify-center" : "btn-secondary justify-center"} onClick={() => setActivePanel("rentsByDocument")}>
          <ReceiptText className="h-4 w-4" />
          Alquileres cobrados por cédula
        </button>
      </div>
      {activePanel === "balances" && <OwnerBalancesPanel owners={people} />}
      {activePanel === "rentsByDocument" && <OwnerRentsByDocumentPanel owners={people} />}
      {activePanel === "directory" && (
      <>
      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-panel md:grid-cols-[1fr_240px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Buscar propietario, código, documento o contacto" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <select className="input" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
          <option value="codigo_desc">Código mayor primero</option>
          <option value="codigo_asc">Código menor primero</option>
          <option value="fecha_desc">Creación más reciente</option>
          <option value="fecha_asc">Creación más antigua</option>
          <option value="nombre_asc">Nombre A-Z</option>
        </select>
        <button className="btn-primary" onClick={onNew}>
          <Plus className="h-4 w-4" />
          Nuevo propietario
        </button>
      </div>
      {visible.length ? (
        <div className="grid gap-4 xl:grid-cols-3">
          {paged.pageItems.map((person) => {
            const props = ownedProperties(person.id);
            const settlement = ownerSettlement(person.id);
            return (
              <div key={person.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-panel">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-ink">{person.full_name}</h3>
                    <p className="mt-1 text-sm text-muted">{[person.legacy_code && `Código ${person.legacy_code}`, person.document || person.email || person.mobile].filter(Boolean).join(" · ")}</p>
                    <p className="mt-1 text-xs text-muted">Creado {formatDateTime(person.created_at)}</p>
                  </div>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{props.length} finca(s)</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-md bg-slate-50 p-3">
                    <p className="text-xs text-muted">Última liquidación</p>
                    <p className="font-semibold text-ink">{settlement ? settlement.period : "Sin generar"}</p>
                  </div>
                  <div className="rounded-md bg-emerald-50 p-3">
                    <p className="text-xs text-emerald-700">A girar</p>
                    <p className="font-semibold text-emerald-700">{settlement ? formatCurrency(settlement.total_to_transfer) : formatCurrency(0)}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-muted">
                  Fincas: {props.map((property) => `${property.reference} (${property.owners.find((owner) => owner.id === person.id)?.percentage ?? 0}%)`).join(", ") || "sin fincas asociadas"}
                </p>
                <p className="mt-2 text-sm text-muted">
                  Banco: {person.bank_name || "sin banco"} · Comisión bancaria {person.bank_transfer_commission_applies ? formatCurrency(person.bank_transfer_commission_amount ?? 65) : "no aplica"}
                </p>
                <p className="mt-2 truncate text-sm text-muted">{person.mobile || person.email || "Sin contacto"}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="btn-secondary" onClick={() => onEdit(person)}>
                    <CreditCard className="h-4 w-4" />
                    Editar banco
                  </button>
                  <button className="icon-action" title="Editar propietario" onClick={() => onEdit(person)}>
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button className="icon-action" title="Eliminar propietario" onClick={() => onDelete(person)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState title="Sin propietarios" detail="Creá propietarios para poder asociarlos a fincas y generar liquidaciones." />
      )}
      <Pagination page={paged.page} totalPages={paged.totalPages} total={visible.length} onPage={paged.setPage} />
      </>
      )}
    </div>
  );
}

function OwnerBalancesPanel({ owners }: { owners: Person[] }) {
  const [untilDate, setUntilDate] = useState(todayIso());
  const [rows, setRows] = useState<OwnerBalanceReportRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const visible = rows.filter((row) => !query || includesText(`${row.owner_name} ${row.owner_document} ${row.owner_legacy_code}`, query));
  const paged = usePaged(visible);
  const totalBalance = visible.reduce((sum, row) => sum + row.balance, 0);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params: Record<string, string> = {};
      if (untilDate) params.until_date = untilDate;
      setRows(await api.ownerBalancesReport(params));
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo cargar saldos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Panel title="Saldos de propietarios" action={<span className="text-sm text-muted">Saldo total {formatCurrency(totalBalance)}</span>}>
      <div className="mb-4 grid gap-3 md:grid-cols-[180px_1fr_auto]">
        <input className="input" type="date" value={untilDate} onChange={(event) => setUntilDate(event.target.value)} />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Buscar propietario o cédula" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <button className="btn-primary justify-center" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Filtrar
        </button>
      </div>
      {error && <p className="mb-3 rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {visible.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-muted">
              <tr>
                <th className="px-3 py-2">Propietario</th>
                <th className="px-3 py-2">Cédula/RUT</th>
                <th className="px-3 py-2">Último período</th>
                <th className="px-3 py-2 text-right">Liquidado</th>
                <th className="px-3 py-2 text-right">Pagado/retirado</th>
                <th className="px-3 py-2 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paged.pageItems.map((row) => (
                <tr key={row.owner_id}>
                  <td className="px-3 py-2">Prop {row.owner_legacy_code || "s/n"} - {row.owner_name}</td>
                  <td className="px-3 py-2">{row.owner_document || "Sin dato"}</td>
                  <td className="px-3 py-2">{row.last_period || "Sin liquidar"}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(row.total_liquidated)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(row.total_paid)}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${row.balance < 0 ? "text-rose-700" : "text-emerald-700"}`}>{formatCurrency(row.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={paged.page} totalPages={paged.totalPages} total={visible.length} onPage={paged.setPage} />
        </div>
      ) : (
        <EmptyState title="Sin saldos" detail={owners.length ? "Generá liquidaciones para ver saldos." : "Creá propietarios para ver saldos."} />
      )}
    </Panel>
  );
}

function OwnerRentsByDocumentPanel({ owners }: { owners: Person[] }) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState(todayIso());
  const [ownerId, setOwnerId] = useState("");
  const [rows, setRows] = useState<OwnerRentByDocumentReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const paged = usePaged(rows);
  const totals = rows.reduce((acc, row) => ({ ownerAmount: acc.ownerAmount + row.owner_amount, irpf: acc.irpf + row.irpf }), { ownerAmount: 0, irpf: 0 });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params: Record<string, string> = {};
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      if (ownerId) params.owner_id = ownerId;
      setRows(await api.ownerRentsByDocumentReport(params));
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo cargar alquileres por cédula");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Panel title="Alquileres cobrados por cédula" action={<span className="text-sm text-muted">IRPF {formatCurrency(totals.irpf)}</span>}>
      <div className="mb-4 grid gap-3 md:grid-cols-[160px_160px_1fr_auto_auto]">
        <input className="input" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        <input className="input" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        <select className="input" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
          <option value="">Todos los propietarios</option>
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>Prop {owner.legacy_code || "s/n"} - {owner.full_name}</option>
          ))}
        </select>
        <button className="btn-primary justify-center" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Filtrar
        </button>
        <a className="btn-secondary justify-center" href={exportUrl(`/exports/dgi-irpf.csv${toDate ? `?period=${toDate.slice(0, 7)}` : ""}`)}>
          <ArrowDownToLine className="h-4 w-4" />
          DGI IRPF CSV
        </a>
      </div>
      {error && <p className="mb-3 rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <MiniMoney label="Importe propietario" value={totals.ownerAmount} strong />
        <MiniMoney label="IRPF" value={totals.irpf} />
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-muted">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Período</th>
                <th className="px-3 py-2">Cédula/RUT</th>
                <th className="px-3 py-2">Propietario</th>
                <th className="px-3 py-2">Inquilino</th>
                <th className="px-3 py-2">Finca</th>
                <th className="px-3 py-2 text-right">%</th>
                <th className="px-3 py-2 text-right">Alquiler cobrado</th>
                <th className="px-3 py-2 text-right">Importe prop.</th>
                <th className="px-3 py-2 text-right">IRPF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paged.pageItems.map((row) => (
                <tr key={`${row.payment_id}-${row.owner_id}-${row.period}`}>
                  <td className="px-3 py-2">{row.payment_date}</td>
                  <td className="px-3 py-2">{row.period}</td>
                  <td className="px-3 py-2">{row.owner_document || "Sin dato"}</td>
                  <td className="px-3 py-2">Prop {row.owner_legacy_code || "s/n"} - {row.owner_name}</td>
                  <td className="px-3 py-2">Inq {row.tenant_legacy_code || "s/n"} - {row.tenant_name}</td>
                  <td className="px-3 py-2">Fin {row.property_reference || "s/n"} - {row.property_address || "Sin dirección"}</td>
                  <td className="px-3 py-2 text-right">{row.owner_percentage}%</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(row.gross_amount)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatCurrency(row.owner_amount)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(row.irpf)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={paged.page} totalPages={paged.totalPages} total={rows.length} onPage={paged.setPage} />
        </div>
      ) : (
        <EmptyState title="Sin alquileres cobrados" detail="No hay alquileres cobrados en el rango seleccionado." />
      )}
    </Panel>
  );
}

function PropertiesView({
  properties,
  onNew,
  onEdit,
  onDetail,
  onDelete
}: {
  properties: PropertyItem[];
  onNew: () => void;
  onEdit: (property: PropertyItem) => void;
  onDetail: (property: PropertyItem) => void;
  onDelete: (property: PropertyItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("todos");
  const [sortBy, setSortBy] = useState("codigo_desc");
  const visible = [...properties]
    .filter((property) => {
      const ownerText = property.owners.map((owner) => owner.full_name).join(" ");
      const serviceText = property.services?.map((service) => `${service.provider} ${service.account_number}`).join(" ") ?? "";
      return (status === "todos" || property.occupancy_status === status) && (!query || includesText(`${property.legacy_code} ${property.reference} ${property.address} ${property.door_number} ${property.unit_number} ${property.padron} ${property.ute_account} ${property.ose_account} ${ownerText} ${serviceText}`, query));
    })
    .sort((a, b) => {
      const codeA = legacyCodeValue(a.legacy_code || "0");
      const codeB = legacyCodeValue(b.legacy_code || "0");
      if (sortBy === "codigo_asc") return codeA > codeB ? 1 : codeA < codeB ? -1 : 0;
      if (sortBy === "codigo_desc") return codeA < codeB ? 1 : codeA > codeB ? -1 : 0;
      if (sortBy === "fecha_desc") return b.created_at.localeCompare(a.created_at);
      if (sortBy === "fecha_asc") return a.created_at.localeCompare(b.created_at);
      if (sortBy === "direccion_asc") return a.address.localeCompare(b.address);
      if (sortBy === "padron_asc") return (a.padron || "").localeCompare(b.padron || "", undefined, { numeric: true });
      return a.reference.localeCompare(b.reference);
    });
  const paged = usePaged(visible);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-panel md:grid-cols-[1fr_220px_240px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Buscar código, ref, dirección, padrón, propietario o cuenta" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <select className="input" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="todos">Todos los estados</option>
          <option value="alquilada">Alquilada</option>
          <option value="libre">Libre</option>
          <option value="mantenimiento">Mantenimiento</option>
        </select>
        <select className="input" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
          <option value="codigo_desc">Código mayor primero</option>
          <option value="codigo_asc">Código menor primero</option>
          <option value="fecha_desc">Creación más reciente</option>
          <option value="fecha_asc">Creación más antigua</option>
          <option value="referencia_asc">Referencia A-Z</option>
          <option value="direccion_asc">Dirección A-Z</option>
          <option value="padron_asc">Padrón matriz / número</option>
        </select>
        <button className="btn-primary" onClick={onNew}>
          <Plus className="h-4 w-4" />
          Nueva propiedad
        </button>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white shadow-panel">
        <div className="hidden grid-cols-[0.9fr_1.5fr_1fr_1fr_auto] gap-3 border-b border-slate-100 p-4 text-xs font-semibold uppercase tracking-[0.12em] text-muted md:grid">
          <span>Ref</span>
          <span>Dirección</span>
          <span>Propietarios</span>
          <span>Cuentas</span>
          <span>Acciones</span>
        </div>
        {paged.pageItems.map((property) => (
          <div key={property.id} className="grid gap-3 border-b border-slate-100 p-4 text-sm last:border-b-0 md:grid-cols-[0.9fr_1.5fr_1fr_1fr_auto]">
            <div>
              <p className="font-semibold text-ink">{property.reference}</p>
              <p className="text-muted">{[property.legacy_code && `Código ${property.legacy_code}`, `Creado ${formatDateTime(property.created_at)}`].filter(Boolean).join(" · ")}</p>
            </div>
            <div>
              <p className="font-medium text-ink">{property.address}</p>
              <p className="text-muted">{[property.door_number && `Puerta ${property.door_number}`, property.unit_number && `Unidad ${property.unit_number}`].filter(Boolean).join(" · ")}</p>
              <p className="text-muted">Padrón {property.padron || "sin dato"} · {property.occupancy_status}</p>
              {property.padron && properties.filter((item) => item.padron && item.padron === property.padron).length > 1 && (
                <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">Comparte padrón matriz</p>
              )}
            </div>
            <p className="text-muted">{property.owners.map((owner) => `${owner.full_name} ${owner.percentage}%`).join(", ") || "Sin propietario"}</p>
            <p className="text-muted">{[property.ute_account && `UTE ${property.ute_account}`, property.ose_account && `OSE ${property.ose_account}`].filter(Boolean).join(" · ") || "Sin cuentas"}</p>
            <div className="flex gap-2">
              <button className="icon-action" title="Ver ficha" onClick={() => onDetail(property)}>
                <Eye className="h-4 w-4" />
              </button>
              <button className="icon-action" title="Editar propiedad" onClick={() => onEdit(property)}>
                <Edit3 className="h-4 w-4" />
              </button>
              <button className="icon-action" title="Eliminar propiedad" onClick={() => onDelete(property)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        <Pagination page={paged.page} totalPages={paged.totalPages} total={visible.length} onPage={paged.setPage} />
      </div>
    </div>
  );
}

function VisitsView({
  visits,
  properties,
  onRefresh
}: {
  visits: PropertyVisit[];
  properties: PropertyItem[];
  onRefresh: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("todos");
  const [propertyId, setPropertyId] = useState(String(properties[0]?.id ?? ""));
  const [interestedName, setInterestedName] = useState("");
  const [interestedPhone, setInterestedPhone] = useState("");
  const [notificationPhone, setNotificationPhone] = useState("");
  const [reminderMinutes, setReminderMinutes] = useState("120");
  const [visitAt, setVisitAt] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const visible = visits.filter((visit) => {
    const text = `${visit.property_reference} ${visit.property_address} ${visit.interested_name} ${visit.interested_phone} ${visit.status}`;
    return (status === "todos" || visit.status === status) && (!query || includesText(text, query));
  });
  const paged = usePaged(visible);
  const nextVisits = visits.filter((visit) => visit.status !== "cancelada" && visit.status !== "realizada").slice(0, 3);
  const dueAlerts = visits.filter((visit) => {
    return isVisitAlertActive(visit, new Date());
  });

  async function createVisit(event: FormEvent) {
    event.preventDefault();
    if (!propertyId || !interestedName || !visitAt) return;
    setLoading(true);
    try {
      await api.createPropertyVisit({
        property_id: Number(propertyId),
        interested_name: interestedName,
        interested_phone: interestedPhone,
        notification_phone: notificationPhone,
        visit_at: visitAt,
        status: "coordinada",
        reminder_minutes_before: Number(reminderMinutes),
        notes
      });
      setInterestedName("");
      setInterestedPhone("");
      setNotificationPhone("");
      setReminderMinutes("120");
      setVisitAt("");
      setNotes("");
      await onRefresh();
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(visit: PropertyVisit, nextStatus: string) {
    await api.updatePropertyVisit(visit.id, { ...visit, status: nextStatus });
    await onRefresh();
  }

  async function removeVisit(visit: PropertyVisit) {
    if (!window.confirm(`Eliminar visita de ${visit.interested_name}?`)) return;
    await api.deletePropertyVisit(visit.id);
    await onRefresh();
  }

  return (
    <div className="space-y-4">
      {dueAlerts.length > 0 && (
        <Panel title="Alertas activas" action={<span className="text-sm text-muted">dentro del margen configurado</span>}>
          <div className="space-y-3">
            {dueAlerts.map((visit) => {
              const internalMessage = `Recordatorio de visita: ${visit.interested_name} en ${visit.property_reference} el ${formatDateTime(visit.visit_at)}. Tel: ${visit.interested_phone || "sin dato"}`;
              return (
                <div key={visit.id} className="grid gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <p className="font-semibold text-amber-950">{formatDateTime(visit.visit_at)} · {visit.property_reference}</p>
                    <p className="text-sm text-amber-900">{visit.interested_name} · {visit.interested_phone || "sin celular"} · avisar {visit.reminder_minutes_before} min antes</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-secondary" onClick={() => navigator.clipboard.writeText(internalMessage)}>
                      <Copy className="h-4 w-4" />
                      Copiar alerta
                    </button>
                    <a className={`btn-secondary ${!visit.notification_phone ? "pointer-events-none opacity-50" : ""}`} href={buildWhatsappUrl(visit.notification_phone, internalMessage) || "#"} target="_blank" rel="noreferrer">
                      <MessageCircle className="h-4 w-4" />
                      WhatsApp interno
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}
      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel title="Nueva visita" action={<span className="text-sm text-muted">agenda comercial</span>}>
          <form onSubmit={createVisit} className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-ink">Propiedad
              <select className="input" value={propertyId} onChange={(event) => setPropertyId(event.target.value)} required>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>{property.reference} · {property.address}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-ink">Fecha y hora
              <input className="input" type="datetime-local" value={visitAt} onChange={(event) => setVisitAt(event.target.value)} required />
            </label>
            <label className="grid gap-1 text-sm font-medium text-ink">Interesado
              <input className="input" value={interestedName} onChange={(event) => setInterestedName(event.target.value)} required />
            </label>
            <label className="grid gap-1 text-sm font-medium text-ink">Celular
              <input className="input" value={interestedPhone} onChange={(event) => setInterestedPhone(event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm font-medium text-ink">Avisar a WhatsApp interno
              <input className="input" value={notificationPhone} onChange={(event) => setNotificationPhone(event.target.value)} placeholder="Celular de Emiliano o equipo" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-ink">Avisar antes
              <select className="input" value={reminderMinutes} onChange={(event) => setReminderMinutes(event.target.value)}>
                <option value="30">30 minutos</option>
                <option value="60">1 hora</option>
                <option value="120">2 horas</option>
                <option value="180">3 horas</option>
                <option value="1440">1 día</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-ink md:col-span-2">Notas
              <textarea className="input min-h-20" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
            <button className="btn-primary justify-center md:col-span-2" disabled={loading || !properties.length}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Agendar visita
            </button>
          </form>
        </Panel>
        <Panel title="Próximas visitas">
          <div className="space-y-3">
            {nextVisits.map((visit) => (
              <div key={visit.id} className="rounded-md border border-slate-100 p-3">
                <p className="font-semibold text-ink">{formatDateTime(visit.visit_at)} · {visit.interested_name}</p>
                <p className="mt-1 text-sm text-muted">{visit.property_reference} · {visit.interested_phone || "sin celular"}</p>
              </div>
            ))}
            {!nextVisits.length && <EmptyState title="Sin visitas próximas" detail="Agendá visitas para propiedades libres o en promoción." />}
            <div className="rounded-md border border-slate-100 bg-slate-50 p-3 text-xs leading-5 text-muted">
              La alerta aparece en el sistema cuando entra en la ventana configurada. WhatsApp se abre con el mensaje listo; el envío automático requiere WhatsApp Business API.
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Agenda de visitas">
        <div className="mb-3 grid gap-2 md:grid-cols-[1fr_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="input pl-9" placeholder="Buscar propiedad, interesado o teléfono" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <select className="input" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="todos">Todos los estados</option>
            <option value="coordinada">Coordinada</option>
            <option value="confirmada">Confirmada</option>
            <option value="realizada">Realizada</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </div>
        <div className="divide-y divide-slate-100">
          {paged.pageItems.map((visit) => {
            const whatsapp = buildWhatsappUrl(visit.interested_phone, visit.contact_message);
            const internalMessage = `Recordatorio de visita: ${visit.interested_name} en ${visit.property_reference} el ${formatDateTime(visit.visit_at)}. Tel: ${visit.interested_phone || "sin dato"}`;
            const internalWhatsapp = buildWhatsappUrl(visit.notification_phone, internalMessage);
            return (
              <div key={visit.id} className="grid gap-3 py-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
                <div>
                  <p className="font-semibold text-ink">{formatDateTime(visit.visit_at)} · {visit.interested_name}</p>
                  <p className="text-sm text-muted">{visit.property_reference} · {visit.property_address} · {visit.status}</p>
                  <p className="mt-1 text-xs text-muted">{visit.contact_message}</p>
                  <p className="mt-1 text-xs text-muted">Aviso interno: {visit.reminder_minutes_before} min antes · {visit.notification_phone || "sin WhatsApp interno"}</p>
                </div>
                <select className="input min-w-36" value={visit.status} onChange={(event) => updateStatus(visit, event.target.value)}>
                  <option value="coordinada">Coordinada</option>
                  <option value="confirmada">Confirmada</option>
                  <option value="realizada">Realizada</option>
                  <option value="cancelada">Cancelada</option>
                </select>
                <div className="flex gap-2">
                  <button className="icon-action" title="Copiar mensaje" onClick={() => navigator.clipboard.writeText(visit.contact_message)}>
                    <Copy className="h-4 w-4" />
                  </button>
                  <a className={`icon-action ${!whatsapp ? "pointer-events-none opacity-50" : ""}`} title="Enviar WhatsApp" href={whatsapp || "#"} target="_blank" rel="noreferrer">
                    <MessageCircle className="h-4 w-4" />
                  </a>
                  <a className={`icon-action ${!internalWhatsapp ? "pointer-events-none opacity-50" : ""}`} title="Avisar al equipo" href={internalWhatsapp || "#"} target="_blank" rel="noreferrer">
                    <Bell className="h-4 w-4" />
                  </a>
                  <button className="icon-action" title="Eliminar visita" onClick={() => removeVisit(visit)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
          {!visible.length && <EmptyState title="Sin visitas" detail="No hay visitas para los filtros actuales." />}
        </div>
        <Pagination page={paged.page} totalPages={paged.totalPages} total={visible.length} onPage={paged.setPage} />
      </Panel>
    </div>
  );
}

function ContractsView({
  contracts,
  onNew,
  onEdit,
  onReajustment,
  onDelete
}: {
  contracts: ContractItem[];
  onNew: () => void;
  onEdit: (contract: ContractItem) => void;
  onReajustment: (contract: ContractItem) => void;
  onDelete: (contract: ContractItem) => void;
}) {
  const [contractPanel, setContractPanel] = useState<"all" | "activeByGuarantee" | "expired">("all");
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("todos");
  const [guaranteeFilter, setGuaranteeFilter] = useState("todos");
	  const [fromDate, setFromDate] = useState("");
	  const [toDate, setToDate] = useState("");
	  const [sortBy, setSortBy] = useState("codigo_desc");
	  const [reajustmentsOnly, setReajustmentsOnly] = useState(false);
	  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
	  const todayDay = dateToUtcDay(todayIso()) ?? 0;
	  const reajustmentLimitDay = todayDay + 30 * 86400000;
	  const visible = [...contracts]
	    .filter((contract) => {
	      const tenantText = (contract.tenants ?? []).map((tenant) => tenant.full_name).join(" ") || contract.tenant_name;
	      const text = `${tenantText} ${contract.property_reference} ${contract.property_address} ${contract.owners.map((owner) => owner.full_name).join(" ")} ${contract.legacy_code} ${contract.guarantee_type} ${contract.guarantee_provider}`;
	      const panelActiveFilter = contractPanel === "activeByGuarantee" ? "activo" : contractPanel === "expired" ? "inactivo" : activeFilter;
	      const matchesActive = panelActiveFilter === "todos" || (panelActiveFilter === "activo" ? contract.active : !contract.active);
	      const matchesGuarantee = guaranteeFilter === "todos" || contract.guarantee_type === guaranteeFilter || contract.guarantee_provider === guaranteeFilter;
	      const matchesDate = inDateRange(contract.start_date, fromDate, toDate);
	      const reajustmentDay = dateToUtcDay(contract.next_reajustment_date);
	      const matchesReajustment = !reajustmentsOnly || Boolean(reajustmentDay && reajustmentDay >= todayDay && reajustmentDay <= reajustmentLimitDay);
	      return matchesActive && matchesGuarantee && matchesDate && matchesReajustment && (!query || includesText(text, query));
	    })
    .sort((a, b) => {
      const codeA = legacyCodeValue(a.legacy_code || "0");
      const codeB = legacyCodeValue(b.legacy_code || "0");
      if (sortBy === "codigo_asc") return codeA > codeB ? 1 : codeA < codeB ? -1 : 0;
      if (sortBy === "codigo_desc") return codeA < codeB ? 1 : codeA > codeB ? -1 : 0;
      if (sortBy === "inicio_desc") return b.start_date.localeCompare(a.start_date);
      if (sortBy === "inicio_asc") return a.start_date.localeCompare(b.start_date);
      return a.tenant_name.localeCompare(b.tenant_name);
    });
  const paged = usePaged(visible);
  const guaranteeOptions = Array.from(new Set(contracts.map((contract) => contract.guarantee_provider || contract.guarantee_type).filter(Boolean)));
  const activeGuaranteeSummary = contracts
    .filter((contract) => contract.active)
    .reduce<Record<string, number>>((acc, contract) => {
      const label = contract.guarantee_provider || contract.guarantee_type || "Sin garantía";
      acc[label] = (acc[label] ?? 0) + 1;
      return acc;
    }, {});
	  return (
	    <div className="space-y-4">
	      <div className="grid gap-3 md:grid-cols-3">
	        <button className={contractPanel === "all" ? "btn-primary justify-center" : "btn-secondary justify-center"} onClick={() => setContractPanel("all")}>
	          <ReceiptText className="h-4 w-4" />
	          Todos los contratos
	        </button>
	        <button className={contractPanel === "activeByGuarantee" ? "btn-primary justify-center" : "btn-secondary justify-center"} onClick={() => setContractPanel("activeByGuarantee")}>
	          <CheckCircle2 className="h-4 w-4" />
	          Vigentes por garantía
	        </button>
	        <button className={contractPanel === "expired" ? "btn-primary justify-center" : "btn-secondary justify-center"} onClick={() => setContractPanel("expired")}>
	          <ClipboardList className="h-4 w-4" />
	          Vencidos / histórico
	        </button>
	      </div>
	      {contractPanel === "activeByGuarantee" && (
	        <div className="grid gap-3 md:grid-cols-4">
	          {Object.entries(activeGuaranteeSummary).map(([label, count]) => (
	            <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-panel">
	              <p className="text-xs uppercase tracking-[0.08em] text-muted">{label}</p>
	              <p className="mt-1 text-2xl font-semibold text-ink">{count}</p>
	            </div>
	          ))}
	        </div>
	      )}
	      {contractPanel === "expired" && (
	        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
	          Los contratos vencidos/inactivos quedan como histórico y no se incluyen en generación automática de alquileres, reajustes próximos ni facturación/liquidaciones automáticas.
	        </p>
	      )}
	      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-panel md:grid-cols-[1fr_180px_180px_160px_160px_220px_auto_auto]">
	        <div className="relative">
	          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
	          <input className="input pl-9" placeholder="Buscar inquilino, finca o propietario" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <select className="input" value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)} disabled={contractPanel !== "all"}>
          <option value="todos">Todos</option>
          <option value="activo">Activos</option>
          <option value="inactivo">Inactivos</option>
        </select>
        <select className="input" value={guaranteeFilter} onChange={(event) => setGuaranteeFilter(event.target.value)}>
          <option value="todos">Todas las garantías</option>
          {guaranteeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <input className="input" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        <input className="input" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
	        <select className="input" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
	          <option value="codigo_desc">Código mayor primero</option>
	          <option value="codigo_asc">Código menor primero</option>
	          <option value="inicio_desc">Inicio más reciente</option>
	          <option value="inicio_asc">Inicio más antiguo</option>
	          <option value="inquilino_asc">Inquilino A-Z</option>
	        </select>
	        <button className={reajustmentsOnly ? "btn-primary" : "btn-secondary"} onClick={() => setReajustmentsOnly((value) => !value)}>
	          <Bell className="h-4 w-4" />
	          Reajustes próximos
	        </button>
	        <button className="btn-primary" onClick={onNew}>
	          <Plus className="h-4 w-4" />
	          Nuevo contrato
        </button>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {paged.pageItems.map((contract) => {
          const isExpanded = Boolean(expanded[contract.id]);
          const tenants = contract.tenants ?? [];
          const tenantLabel = tenants.length > 1 ? `${contract.tenant_name} +${tenants.length - 1}` : contract.tenant_name;
          return (
          <div key={contract.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-panel">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-ink">{tenantLabel}</h3>
                <p className="mt-1 text-sm text-muted">{[contract.legacy_code && `Contrato ${contract.legacy_code}`, contract.property_reference, contract.property_address].filter(Boolean).join(" · ")}</p>
              </div>
              <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{contract.active ? "Activo" : "Inactivo"}</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <MiniStat label="Alquiler" value={formatCurrency(contract.rent_amount)} />
              <MiniStat label="Comisión" value={`${contract.commission_percent}%`} />
              <MiniStat label="IRPF" value={contract.irpf_applies ? `${contract.irpf_percent}%` : "No aplica"} />
              <MiniStat label="Garantía" value={contract.guarantee_type === "anda" ? "ANDA 2%" : contract.guarantee_type === "contaduria" ? "Contaduría 3%" : contract.guarantee_provider || contract.guarantee_type} />
            </div>
            <p className="mt-4 text-sm text-muted">Propietarios: {contract.owners.map((owner) => `${owner.full_name} ${owner.percentage}%`).join(", ") || "Sin propietarios"}</p>
            {isExpanded && (
              <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-muted">
                {tenants.length > 0 && (
                  <div className="mb-3">
                    <p className="font-semibold text-ink">Titulares</p>
                    <div className="mt-2 space-y-1">
                      {tenants.map((tenant) => (
                        <p key={tenant.id}>
                          {tenant.full_name}
                          {tenant.document ? ` · CI ${tenant.document}` : ""}
                          {tenant.email ? ` · ${tenant.email}` : ""}
                          {tenant.mobile ? ` · ${tenant.mobile}` : ""}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                <p>Inicio: {contract.start_date} · Fin contractual: {contract.end_date || "sin fecha"} · Cobrar hasta: {contract.billing_end_date || contract.end_date || "sin fecha"}</p>
                <p>Origen pago: {contract.payment_origin} · Tipo: {contract.payment_type}</p>
                <p>Régimen: {contract.rent_regime} · Índice: {contract.reajustment_index} · Próximo reajuste: {contract.next_reajustment_date || "sin fecha"}</p>
                <p>Finca: {contract.property_reference} · {contract.property_address}</p>
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button className="icon-action" title={isExpanded ? "Contraer" : "Expandir"} onClick={() => setExpanded({ ...expanded, [contract.id]: !isExpanded })}>
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              <button className="icon-action" title={contract.active ? "Reajustar alquiler" : "Contrato vencido: sin reajustes"} onClick={() => onReajustment(contract)} disabled={!contract.active}>
                <Bell className="h-4 w-4" />
              </button>
              <button className="icon-action" title="Editar contrato" onClick={() => onEdit(contract)}>
                <Edit3 className="h-4 w-4" />
              </button>
              <button className="icon-action" title="Eliminar contrato" onClick={() => onDelete(contract)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          );
        })}
      </div>
      <Pagination page={paged.page} totalPages={paged.totalPages} total={visible.length} onPage={paged.setPage} />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function PaymentsView({
  people,
  charges,
  credits,
  onPay,
  onBatchPay,
  onNewPayment,
  onInstitutionalReconciliation
}: {
  people: Person[];
  charges: Charge[];
  credits: TenantCredit[];
  onPay: (charge: Charge) => void;
  onBatchPay: (person: Person, charges: Charge[]) => void;
  onNewPayment: (person: Person) => void;
  onInstitutionalReconciliation: (institution: "anda" | "contaduria") => void;
}) {
  type PaymentTab = "debtors" | "openCharges" | "credits";
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [paymentQuery, setPaymentQuery] = useState("");
  const [creditQuery, setCreditQuery] = useState("");
  const [creditOpen, setCreditOpen] = useState(true);
  const [openChargeQuery, setOpenChargeQuery] = useState("");
  const [openChargeStatusFilter, setOpenChargeStatusFilter] = useState("todos");
  const [activeTab, setActiveTab] = useState<PaymentTab>("debtors");
  const [selectedPersonId, setSelectedPersonId] = useState(String(people[0]?.id ?? ""));
  const paymentPeople = useMemo(
    () => people.filter((person) => {
      const personCharges = charges.filter((charge) => charge.responsible_person_id === person.id);
      const searchable = [
        personOptionLabel(person),
        person.document,
        person.mobile,
        person.phone,
        person.email,
        ...personCharges.map((charge) => `${charge.property_reference} ${charge.property_address} ${charge.concept} ${charge.period}`)
      ].join(" ");
      return !paymentQuery || includesText(searchable, paymentQuery);
    }),
    [people, charges, paymentQuery]
  );
  useEffect(() => {
    if (paymentPeople.length && !paymentPeople.some((person) => String(person.id) === selectedPersonId)) {
      setSelectedPersonId(String(paymentPeople[0].id));
    }
  }, [paymentPeople, selectedPersonId]);
  const debtors = people
    .map((person) => ({
      person,
      charges: charges.filter((charge) => charge.responsible_person_id === person.id)
    }))
    .filter((item) => {
      const total = item.charges.reduce((sum, charge) => sum + charge.remaining_amount, 0);
      const hasOverdue = item.charges.some((charge) => charge.status === "vencido");
      const matchesStatus = statusFilter === "todos" || (statusFilter === "vencida" ? hasOverdue : total > 0);
      return item.charges.length > 0 && matchesStatus && (!query || includesText(`${item.person.full_name} ${item.person.document} ${item.person.mobile}`, query));
    })
    .sort((a, b) => b.charges.reduce((sum, charge) => sum + charge.remaining_amount, 0) - a.charges.reduce((sum, charge) => sum + charge.remaining_amount, 0));
  const visibleOpenCharges = charges.filter((charge) => {
    const matchesStatus = openChargeStatusFilter === "todos" || charge.status === openChargeStatusFilter;
    const searchable = [
      chargeTenantLabel(charge),
      chargePropertyLabel(charge),
      charge.concept,
      charge.description,
      charge.period,
      charge.accrual_period,
      charge.settlement_period,
      charge.due_date
    ].join(" ");
    return matchesStatus && (!openChargeQuery || includesText(searchable, openChargeQuery));
  });
  const activeCredits = credits.filter((credit) => credit.remaining_amount > 0);
  const visibleCredits = activeCredits.filter((credit) => {
    const searchable = `${credit.person_name} ${credit.notes} ${credit.status} ${credit.payment_id ?? ""}`;
    return !creditQuery || includesText(searchable, creditQuery);
  });
  const pagedDebtors = usePaged(debtors);
  const pagedOpenCharges = usePaged(visibleOpenCharges);
  const pagedCredits = usePaged(visibleCredits);
  const selectedPerson = paymentPeople.find((person) => String(person.id) === selectedPersonId) ?? paymentPeople[0];
  const selectedPersonCharges = selectedPerson ? charges.filter((charge) => charge.responsible_person_id === selectedPerson.id) : [];
  const creditTotal = visibleCredits.reduce((sum, credit) => sum + credit.remaining_amount, 0);

  return (
    <div className="space-y-4">
      <Panel title="Ingreso pago inquilino" action={<span className="text-sm text-muted">buscá, seleccioná deudas y cobrá</span>}>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                className="input pl-9"
                placeholder="Buscar por Inq, nombre, cédula, celular o finca"
                value={paymentQuery}
                onChange={(event) => setPaymentQuery(event.target.value)}
              />
            </div>
	          <select className="input" value={selectedPersonId} onChange={(event) => setSelectedPersonId(event.target.value)}>
	            {paymentPeople.map((person) => (
	              <option key={person.id} value={person.id}>{personOptionLabel(person)}</option>
	            ))}
	          </select>
	          <button className="btn-primary justify-center" onClick={() => selectedPerson && onBatchPay(selectedPerson, selectedPersonCharges)} disabled={!selectedPerson}>
	            <Banknote className="h-4 w-4" />
	            Ingreso pago
	          </button>
	          <button className="btn-secondary justify-center" onClick={() => selectedPerson && onNewPayment(selectedPerson)} disabled={!selectedPerson}>
	            <CreditCard className="h-4 w-4" />
	            Pago sin imputar
	          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-secondary justify-center" onClick={() => onInstitutionalReconciliation("anda")}>
            <Banknote className="h-4 w-4" />
            Conciliar ANDA
          </button>
          <button className="btn-secondary justify-center" onClick={() => onInstitutionalReconciliation("contaduria")}>
            <Banknote className="h-4 w-4" />
		            Conciliar Contaduría
		          </button>
		        </div>
		      </Panel>

      <ListTabs<PaymentTab>
        active={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: "debtors", label: "Deudas por inquilino", count: debtors.length },
          { id: "openCharges", label: "Deudas abiertas/parciales", count: visibleOpenCharges.length },
          { id: "credits", label: "Saldos a favor", count: activeCredits.length }
        ]}
      />

      {activeTab === "credits" && (
        <CollapsiblePanel
          title="Saldos a favor"
          subtitle={`${formatCurrency(creditTotal)} visible · pagos recibidos sin imputar completo`}
          open={creditOpen}
          onToggle={() => setCreditOpen(!creditOpen)}
        >
          <div className="mb-3 grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input className="input pl-9" placeholder="Buscar por inquilino, nota, estado o pago" value={creditQuery} onChange={(event) => setCreditQuery(event.target.value)} />
            </div>
            <span className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">Total {formatCurrency(creditTotal)}</span>
          </div>
          {visibleCredits.length ? (
            <div className="divide-y divide-slate-100">
              {pagedCredits.pageItems.map((credit) => (
                <div key={credit.id} className="grid gap-3 py-3 md:grid-cols-[1fr_auto_auto] md:items-center">
                  <div>
                    <p className="font-semibold text-ink">{credit.person_name}</p>
                    <p className="text-sm text-muted">{credit.notes || "Saldo disponible"} · {credit.status}</p>
                  </div>
                  <span className="rounded-md bg-emerald-50 px-2 py-1 text-sm font-semibold text-emerald-700">{formatCurrency(credit.remaining_amount)}</span>
                  <span className="text-xs text-muted">Pago #{credit.payment_id ?? "-"}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Sin saldos a favor" detail="Cuando un inquilino pague de más o quede dinero sin imputar, aparecerá acá." />
          )}
          <Pagination page={pagedCredits.page} totalPages={pagedCredits.totalPages} total={visibleCredits.length} onPage={pagedCredits.setPage} />
        </CollapsiblePanel>
      )}

      {activeTab === "debtors" && (
        <Panel title="Deudas por inquilino" action={<span className="text-sm text-muted">vencidas, parciales y abiertas</span>}>
          <div className="mb-3 grid gap-2 md:grid-cols-[1fr_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input className="input pl-9" placeholder="Buscar inquilino" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="todos">Todas las deudas</option>
              <option value="vencida">Con vencidas</option>
              <option value="abierta">Con saldo abierto</option>
            </select>
          </div>
          {debtors.length ? (
            <div className="divide-y divide-slate-100">
              {pagedDebtors.pageItems.map(({ person, charges: personCharges }) => {
                const total = personCharges.reduce((sum, charge) => sum + charge.remaining_amount, 0);
                return (
                  <div key={person.id} className="grid gap-3 py-3 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
                    <div>
                      <p className="font-semibold text-ink">{personOptionLabel(person)}</p>
                      <p className="text-sm text-muted">{personCharges.length} deudas abiertas · {formatCurrency(total)}</p>
                    </div>
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-sm font-semibold text-slate-700">{formatCurrency(total)}</span>
                    <button className="btn-primary justify-center" onClick={() => onBatchPay(person, personCharges)}>
                      <Banknote className="h-4 w-4" />
                      Ingreso pago
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="Sin deudas abiertas" detail="Cuando haya saldos pendientes, aparecen acá para imputar pagos rápido." />
          )}
          <Pagination page={pagedDebtors.page} totalPages={pagedDebtors.totalPages} total={debtors.length} onPage={pagedDebtors.setPage} />
        </Panel>
      )}

      {activeTab === "openCharges" && (
        <Panel title="Deudas abiertas y parciales" action={<span className="text-sm text-muted">muestra concepto, período, pagado y saldo</span>}>
          <div className="mb-3 grid gap-2 md:grid-cols-[1fr_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input className="input pl-9" placeholder="Buscar por inquilino, finca, concepto o período" value={openChargeQuery} onChange={(event) => setOpenChargeQuery(event.target.value)} />
            </div>
            <select className="input" value={openChargeStatusFilter} onChange={(event) => setOpenChargeStatusFilter(event.target.value)}>
              <option value="todos">Todos los estados</option>
              <option value="pendiente">Pendientes</option>
              <option value="parcial">Pagos parciales</option>
              <option value="vencido">Vencidas</option>
            </select>
          </div>
          {visibleOpenCharges.length ? (
            <div className="divide-y divide-slate-100">
              {pagedOpenCharges.pageItems.map((charge) => (
                <ChargeRow key={charge.id} charge={charge} onPay={onPay} onReminder={() => undefined} compact />
              ))}
            </div>
          ) : (
            <EmptyState title="Sin deudas con ese filtro" detail="Probá limpiar la búsqueda o cambiar el estado." />
          )}
          <Pagination page={pagedOpenCharges.page} totalPages={pagedOpenCharges.totalPages} total={visibleOpenCharges.length} onPage={pagedOpenCharges.setPage} />
        </Panel>
      )}
    </div>
  );
}

function CashView({
  movements,
  ownerCharges,
  credits,
  owners,
  properties,
  onNewOwnerCharge,
  onVoidOwnerCharge
}: {
  movements: CashMovement[];
  ownerCharges: OwnerCharge[];
  credits: TenantCredit[];
  owners: Person[];
  properties: PropertyItem[];
  onNewOwnerCharge: () => void;
  onVoidOwnerCharge: (ownerCharge: OwnerCharge) => Promise<void>;
}) {
  type CashTab = "movements" | "credits" | "ownerCharges" | "commissionIva" | "billingHistory";
  const [activeTab, setActiveTab] = useState<CashTab>("movements");
  const [typeFilter, setTypeFilter] = useState("todos");
  const [originFilter, setOriginFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [creditQuery, setCreditQuery] = useState("");
  const [creditOpen, setCreditOpen] = useState(true);
  const [ownerChargeQuery, setOwnerChargeQuery] = useState("");
  const [ownerChargeStatusFilter, setOwnerChargeStatusFilter] = useState("todos");
  const [ownerChargeCashFilter, setOwnerChargeCashFilter] = useState("todos");
  const visibleMovements = movements.filter((movement) => {
    const matchesType = typeFilter === "todos" || movement.movement_type === typeFilter;
    const matchesOrigin = originFilter === "todos" || movement.origin === originFilter;
    const matchesStatus = statusFilter === "todos" || movement.status === statusFilter;
    const matchesDate = inDateRange(movement.movement_date, fromDate, toDate);
    const matchesText = !query || includesText(`${movement.concept} ${movement.person_legacy_code} ${movement.person_name} ${movement.property_reference} ${movement.property_address} ${movement.origin}`, query);
    return matchesType && matchesOrigin && matchesStatus && matchesDate && matchesText;
  });
  const visibleOwnerCharges = ownerCharges.filter((item) => {
    const matchesStatus = ownerChargeStatusFilter === "todos" || item.status === ownerChargeStatusFilter;
    const matchesCash =
      ownerChargeCashFilter === "todos" ||
      (ownerChargeCashFilter === "con_caja" ? item.paid_by_agency : !item.paid_by_agency);
    const searchable = [
      item.owner_legacy_code,
      item.owner_name,
      item.property_reference,
      item.property_address,
      item.concept,
      item.description,
      item.period,
      item.period_from,
      item.period_to,
      item.charge_date
    ].join(" ");
    return matchesStatus && matchesCash && (!ownerChargeQuery || includesText(searchable, ownerChargeQuery));
  });
  const activeCredits = credits.filter((credit) => credit.remaining_amount > 0);
  const visibleCredits = activeCredits.filter((credit) => {
    const searchable = `${credit.person_name} ${credit.notes} ${credit.status} ${credit.payment_id ?? ""}`;
    return !creditQuery || includesText(searchable, creditQuery);
  });
  const pagedMovements = usePaged(visibleMovements);
  const pagedOwnerCharges = usePaged(visibleOwnerCharges);
  const pagedCredits = usePaged(visibleCredits);
  const entries = visibleMovements.filter((item) => item.movement_type === "entrada" && item.status === "confirmado");
  const exits = visibleMovements.filter((item) => item.movement_type === "salida" && item.status === "confirmado");
  const totalIn = entries.reduce((sum, item) => sum + item.amount, 0);
  const totalOut = exits.reduce((sum, item) => sum + item.amount, 0);
  const totalCredits = activeCredits.reduce((sum, item) => sum + item.remaining_amount, 0);
  const visibleCreditTotal = visibleCredits.reduce((sum, item) => sum + item.remaining_amount, 0);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <Metric title="Entradas" value={formatCurrency(totalIn)} icon={ArrowDownToLine} tone="green" />
        <Metric title="Salidas" value={formatCurrency(totalOut)} icon={WalletCards} tone="rose" />
        <Metric title="Saldo caja" value={formatCurrency(totalIn - totalOut)} icon={Banknote} tone="blue" />
        <Metric title="Saldo a favor" value={formatCurrency(totalCredits)} icon={CreditCard} tone="green" />
      </div>
      <ListTabs<CashTab>
        active={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: "movements", label: "Movimientos", count: visibleMovements.length },
          { id: "credits", label: "Saldos a favor", count: activeCredits.length },
          { id: "ownerCharges", label: "Débitos propietario", count: visibleOwnerCharges.length },
          { id: "commissionIva", label: "Comisión e IVA" },
          { id: "billingHistory", label: "Historial facturación" }
        ]}
      />

      {activeTab === "credits" && (
        <CollapsiblePanel
          title="Saldos a favor"
          subtitle={`${formatCurrency(visibleCreditTotal)} visible · dinero recibido sin imputar a una deuda`}
          open={creditOpen}
          onToggle={() => setCreditOpen(!creditOpen)}
        >
          <div className="mb-3 grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input className="input pl-9" placeholder="Buscar por inquilino, nota, estado o pago" value={creditQuery} onChange={(event) => setCreditQuery(event.target.value)} />
            </div>
            <span className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">Total {formatCurrency(visibleCreditTotal)}</span>
          </div>
          {visibleCredits.length ? (
            <div className="divide-y divide-slate-100">
              {pagedCredits.pageItems.map((credit) => (
                <div key={credit.id} className="grid gap-3 py-3 md:grid-cols-[1fr_auto_auto] md:items-center">
                  <div>
                    <p className="font-semibold text-ink">{credit.person_name}</p>
                    <p className="text-sm text-muted">{credit.notes || "Saldo disponible"} · {credit.status}</p>
                  </div>
                  <span className="rounded-md bg-emerald-50 px-2 py-1 text-sm font-semibold text-emerald-700">{formatCurrency(credit.remaining_amount)}</span>
                  <span className="text-xs text-muted">Pago #{credit.payment_id ?? "-"}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Sin saldos a favor" detail="Cuando un inquilino pague de más o quede dinero sin imputar, aparecerá acá." />
          )}
          <Pagination page={pagedCredits.page} totalPages={pagedCredits.totalPages} total={visibleCredits.length} onPage={pagedCredits.setPage} />
        </CollapsiblePanel>
      )}

      {activeTab === "ownerCharges" && (
        <Panel
          title="Débitos/descuentos a propietario"
          action={
            <button className="btn-primary" onClick={onNewOwnerCharge} disabled={!owners.length || !properties.length}>
              <Plus className="h-4 w-4" />
              Nuevo débito
            </button>
          }
        >
          <p className="mb-3 rounded-md bg-slate-50 p-3 text-sm text-muted">
            Esto no significa que el inquilino pagó. Un débito con etiqueta `Sin caja` solo descuenta en la liquidación del propietario; una entrada real de inquilino aparece en `Movimientos` cuando se registra el pago.
          </p>
          <div className="mb-3 grid gap-2 md:grid-cols-[1fr_180px_180px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input className="input pl-9" placeholder="Buscar propietario, finca, concepto o período" value={ownerChargeQuery} onChange={(event) => setOwnerChargeQuery(event.target.value)} />
            </div>
            <select className="input" value={ownerChargeStatusFilter} onChange={(event) => setOwnerChargeStatusFilter(event.target.value)}>
              <option value="todos">Todos los estados</option>
              <option value="pendiente">Pendientes</option>
              <option value="anulado">Anulados</option>
            </select>
            <select className="input" value={ownerChargeCashFilter} onChange={(event) => setOwnerChargeCashFilter(event.target.value)}>
              <option value="todos">Con y sin caja</option>
              <option value="con_caja">Caja automática</option>
              <option value="sin_caja">Sin caja</option>
            </select>
          </div>
          {visibleOwnerCharges.length ? (
            <div className="divide-y divide-slate-100">
              {pagedOwnerCharges.pageItems.map((item) => (
                <div key={item.id} className="grid gap-3 py-3 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
                  <div>
                    <p className="font-semibold text-ink">Prop {item.owner_legacy_code || "s/n"} - {item.owner_name}</p>
                    <p className="text-sm text-muted">
                      Fin {item.property_reference || "s/n"} - {item.property_address || "Sin dirección"} · {item.concept} · {item.charge_date} · {item.split_by_ownership ? "reparte por %" : "directo"}
                    </p>
                    {(item.period_from || item.period_to) && (
                      <p className="text-xs text-muted">Período {item.period_from || "?"} a {item.period_to || "?"}</p>
                    )}
                  </div>
                  <span className="rounded-md bg-rose-50 px-2 py-1 text-sm font-semibold text-rose-700">{formatCurrency(item.amount)}</span>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{item.paid_by_agency ? "Caja automática" : "Sin caja"}</span>
                  <button className="icon-action" title="Anular débito" onClick={() => onVoidOwnerCharge(item)} disabled={item.status === "anulado"}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Sin débitos a propietario" detail="Registrá contribución, primaria, saneamiento u otros gastos administrados." />
          )}
          <Pagination page={pagedOwnerCharges.page} totalPages={pagedOwnerCharges.totalPages} total={visibleOwnerCharges.length} onPage={pagedOwnerCharges.setPage} />
        </Panel>
      )}

      {activeTab === "commissionIva" && (
        <CommissionIvaPanel
          owners={owners}
          title="Comisión e IVA generados"
          detail="Control por fecha de las comisiones e IVA originados por alquileres y otros cobros."
        />
      )}

      {activeTab === "billingHistory" && (
        <CommissionIvaPanel
          owners={owners}
          title="Historial de facturación"
          detail="Historial operativo para saber cuándo se generó cada comisión/IVA y por qué concepto."
          billingMode
        />
      )}

      {activeTab === "movements" && (
        <Panel title="Movimientos de caja" action={<span className="text-sm text-muted">pagos, gastos, ajustes y reversas</span>}>
          <div className="mb-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
            <div className="relative md:col-span-3 xl:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input className="input pl-9" placeholder="Buscar concepto, persona o finca" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <select className="input" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="todos">Todos los tipos</option>
              <option value="entrada">Entradas</option>
              <option value="salida">Salidas</option>
            </select>
            <select className="input" value={originFilter} onChange={(event) => setOriginFilter(event.target.value)}>
              <option value="todos">Todos los orígenes</option>
              <option value="payment">Pagos</option>
              <option value="payment_adjustment">Ajustes de pago</option>
              <option value="owner_settlement">Retiros propietario</option>
              <option value="owner_charge">Gastos propietario</option>
              <option value="manual">Manual</option>
              <option value="anulacion">Anulaciones</option>
            </select>
            <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="todos">Todos los estados</option>
              <option value="confirmado">Confirmados</option>
              <option value="anulado">Anulados</option>
            </select>
            <input className="input" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
            <input className="input" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </div>
          {visibleMovements.length ? (
            <div className="divide-y divide-slate-100">
              {pagedMovements.pageItems.map((movement) => (
                <div key={movement.id} className="grid gap-3 py-3 md:grid-cols-[auto_1fr_auto_auto_auto] md:items-center">
                  <span className={`rounded-md px-2 py-1 text-xs font-semibold ${movement.movement_type === "entrada" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                    {movement.movement_type}
                  </span>
                  <div>
                    <p className="font-semibold text-ink">{movement.concept}</p>
                    <p className="text-sm text-muted">
                      {movement.movement_date} · {cashMovementPersonLabel(movement)} · Fin {movement.property_reference || "s/n"} - {movement.property_address || "Sin dirección"} · {movement.origin}
                    </p>
                  </div>
                  <p className="font-semibold text-ink">{formatCurrency(movement.amount)}</p>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{movement.status}</span>
                  {movement.movement_type === "salida" ? (
                    <a className="icon-action" title="Descargar retiro PDF" href={exportUrl(`/cash-movements/${movement.id}/withdrawal.pdf`)}>
                      <ArrowDownToLine className="h-4 w-4" />
                    </a>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Sin movimientos" detail="Los pagos y débitos generarán caja automáticamente." />
          )}
          <Pagination page={pagedMovements.page} totalPages={pagedMovements.totalPages} total={visibleMovements.length} onPage={pagedMovements.setPage} />
        </Panel>
      )}
    </div>
  );
}

function CommissionIvaPanel({
  owners,
  title,
  detail,
  billingMode = false
}: {
  owners: Person[];
  title: string;
  detail: string;
  billingMode?: boolean;
}) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState(todayIso());
  const [ownerId, setOwnerId] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<CommissionIvaReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const filteredRows = rows.filter((row) => {
    const searchable = [
      row.owner_name,
      row.owner_document,
      row.tenant_name,
      row.tenant_legacy_code,
      row.property_reference,
      row.property_address,
      row.concept,
      row.period,
      row.description
    ].join(" ");
    return !query || includesText(searchable, query);
  });
  const paged = usePaged(filteredRows);
  const totals = filteredRows.reduce(
    (acc, row) => ({
      commission: acc.commission + row.commission,
      iva: acc.iva + row.iva,
      billed: acc.billed + row.total_billed
    }),
    { commission: 0, iva: 0, billed: 0 }
  );

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params: Record<string, string> = {};
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      if (ownerId) params.owner_id = ownerId;
      const data = await api.commissionIvaReport(params);
      setRows(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo cargar el reporte");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Panel title={title} action={<span className="text-sm text-muted">{formatCurrency(totals.billed)}</span>}>
      <p className="mb-3 rounded-md bg-slate-50 p-3 text-sm text-muted">{detail}</p>
      <div className="mb-3 grid gap-2 xl:grid-cols-[1fr_180px_180px_220px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Buscar propietario, inquilino, finca o concepto" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <input className="input" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        <input className="input" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        <select className="input" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
          <option value="">Todos los propietarios</option>
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>Prop {owner.legacy_code || "s/n"} - {owner.full_name}</option>
          ))}
        </select>
        <button className="btn-secondary justify-center" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Filtrar
        </button>
      </div>
      {error && <p className="mb-3 rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <div className="mb-3 grid gap-3 md:grid-cols-3">
        <MiniStat label="Comisión" value={formatCurrency(totals.commission)} />
        <MiniStat label="IVA" value={formatCurrency(totals.iva)} />
        <MiniStat label="Total facturado" value={formatCurrency(totals.billed)} />
      </div>
      {filteredRows.length ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-[1120px] divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-muted">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Propietario</th>
                <th className="px-3 py-2">Inquilino</th>
                <th className="px-3 py-2">Finca</th>
                <th className="px-3 py-2">Concepto</th>
                <th className="px-3 py-2">Período</th>
                <th className="px-3 py-2 text-right">Comisión</th>
                <th className="px-3 py-2 text-right">IVA</th>
                <th className="px-3 py-2 text-right">Total</th>
                {billingMode && <th className="px-3 py-2">Origen</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paged.pageItems.map((row) => (
                <tr key={`${row.payment_id}-${row.charge_id}-${row.owner_id}`} className="align-top">
                  <td className="px-3 py-2">{row.payment_date}</td>
                  <td className="px-3 py-2">
                    <p className="font-semibold text-ink">{row.owner_name}</p>
                    <p className="text-xs text-muted">{row.owner_document || "sin documento"} · {row.owner_percentage}%</p>
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-ink">Inq {row.tenant_legacy_code || "s/n"} - {row.tenant_name}</p>
                  </td>
                  <td className="px-3 py-2">Fin {row.property_reference || "s/n"} - {row.property_address || "Sin dirección"}</td>
                  <td className="px-3 py-2">{row.concept}</td>
                  <td className="px-3 py-2">{formatPeriodShort(row.period)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(row.commission)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(row.iva)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{formatCurrency(row.total_billed)}</td>
                  {billingMode && <td className="px-3 py-2">Pago #{row.payment_id}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="Sin resultados" detail="Ajustá el rango de fechas o el propietario para ver movimientos facturables." />
      )}
      <Pagination page={paged.page} totalPages={paged.totalPages} total={filteredRows.length} onPage={paged.setPage} />
    </Panel>
  );
}

function SettlementsView({
  settlements,
  onGenerate,
  onPay
}: {
  settlements: Settlement[];
  onGenerate: (period: string) => Promise<void>;
  onPay: (settlement: Settlement) => Promise<void>;
}) {
  const [period, setPeriod] = useState(currentPeriod());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const visible = settlements.filter((item) => {
    const matchesPeriod = !period || item.period === period;
    const matchesStatus = statusFilter === "todos" || item.status === statusFilter;
    return matchesPeriod && matchesStatus && (!query || includesText(item.owner_name, query));
  });
  const paged = usePaged(visible);

  async function generate() {
    setLoading(true);
    setError("");
    try {
      await onGenerate(period);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo generar la liquidación");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-panel sm:flex-row sm:items-center sm:justify-between">
        <div className="grid gap-3 sm:grid-cols-[150px_1fr_160px_auto]">
          <input className="input w-40" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="input pl-9" placeholder="Buscar propietario" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="todos">Todos</option>
            <option value="borrador">Borrador</option>
            <option value="emitida">Emitida</option>
          </select>
          <button className="btn-primary" onClick={generate} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Generar
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn-secondary" href={exportUrl("/exports/settlements.csv")}>
            <ArrowDownToLine className="h-4 w-4" />
            Liquidación
          </a>
          <a className="btn-secondary" href={exportUrl(`/exports/accounting.csv?period=${period}`)}>
            <ArrowDownToLine className="h-4 w-4" />
            Contable
          </a>
          <a className="btn-secondary" href={exportUrl(`/exports/dgi-irpf.csv?period=${period}`)}>
            <ArrowDownToLine className="h-4 w-4" />
            DGI IRPF
          </a>
          <a className="btn-secondary" href={exportUrl("/reports/tenant-debtors.pdf")}>
            <ArrowDownToLine className="h-4 w-4" />
            Deudores PDF
          </a>
          <a className="btn-secondary" href={exportUrl(`/reports/commission-iva.pdf?period=${period}`)}>
            <ArrowDownToLine className="h-4 w-4" />
            Comisión/IVA PDF
          </a>
        </div>
      </div>
      {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <div className="rounded-lg border border-slate-200 bg-white shadow-panel">
        {visible.length ? (
          <div className="divide-y divide-slate-100">
            {paged.pageItems.map((item) => {
              const isExpanded = expanded[item.id] ?? false;
              return (
              <div key={item.id} className="space-y-3 p-4">
                <div className="grid gap-3 md:grid-cols-[1fr_repeat(7,auto)] md:items-center">
                  <button className="flex items-center gap-2 text-left font-semibold text-ink" onClick={() => setExpanded({ ...expanded, [item.id]: !isExpanded })}>
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {item.owner_name}
                  </button>
                  <MiniMoney label="Ingresos" value={item.income} />
                  <MiniMoney label="Gastos" value={item.expenses} />
                  <MiniMoney label="Comisión" value={item.commission} />
                  <MiniMoney label="IVA" value={item.iva} />
                  <MiniMoney label="IRPF" value={item.irpf} />
                  <MiniMoney label="Banco" value={item.bank_transfer_fee ?? 0} />
                  <MiniMoney label="A girar" value={item.total_to_transfer} strong />
                </div>
                <div className="flex flex-wrap gap-2">
                  <a className="btn-secondary text-xs" href={exportUrl(`/settlements/owners/${item.id}/liquidation.pdf`)}>
                    <ArrowDownToLine className="h-4 w-4" />
                    Descargar liquidación PDF
                  </a>
                  <a className="btn-secondary text-xs" href={exportUrl(`/settlements/owners/${item.id}/withdrawal.pdf`)}>
                    <ArrowDownToLine className="h-4 w-4" />
                    Descargar retiro PDF
                  </a>
                  <button
                    className="btn-primary text-xs"
                    onClick={() => onPay(item)}
                    disabled={item.status === "emitida" || Boolean(item.cash_movement)}
                  >
                    <Banknote className="h-4 w-4" />
                    {item.status === "emitida" || item.cash_movement ? "Pago registrado" : "Registrar pago/retiro"}
                  </button>
                </div>
                {isExpanded && item.lines?.length ? (
                  <div className="overflow-hidden rounded-md border border-slate-100">
                    <div className="hidden grid-cols-[1fr_0.8fr_0.8fr_repeat(5,auto)] gap-2 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted lg:grid">
                      <span>Finca</span>
                      <span>Concepto</span>
                      <span>Devengado</span>
                      <span>%</span>
                      <span>Ingreso</span>
                      <span>Gasto</span>
                      <span>Imp.</span>
                      <span>Neto</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {item.lines.map((line) => (
                        <div key={line.id} className="grid gap-2 px-3 py-2 text-sm lg:grid-cols-[1fr_0.8fr_0.8fr_repeat(5,auto)] lg:items-center">
                          <span className="font-medium text-ink">{line.property_reference || "Sin finca"}</span>
                          <span className="text-muted">{line.concept}{line.tenant_name ? ` · ${line.tenant_name}` : ""}</span>
                          <span className="text-muted">{line.accrual_period || line.period}</span>
                          <span className="text-muted">{line.owner_percentage}%</span>
                          <span className="font-medium text-ink">{formatCurrency(line.owner_amount)}</span>
                          <span className="font-medium text-rose-700">{formatCurrency(line.expense_amount)}</span>
                          <span className="text-muted">{formatCurrency(line.commission + line.iva + line.irpf)}</span>
                          <span className="font-semibold text-brand">{formatCurrency(line.net_amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              );
            })}
          </div>
        ) : (
          <div className="p-4">
            <EmptyState title="Sin liquidaciones generadas" detail="Elegí el periodo y generá la liquidación demo." />
          </div>
        )}
        <Pagination page={paged.page} totalPages={paged.totalPages} total={visible.length} onPage={paged.setPage} />
      </div>
    </div>
  );
}

function MiniMoney({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="min-w-28">
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-sm ${strong ? "font-bold text-brand" : "font-semibold text-ink"}`}>{formatCurrency(value)}</p>
    </div>
  );
}

function ChargeModal({
  contracts,
  properties,
  allCharges,
  charge,
  onRefreshData,
  onClose,
  onSaved
}: {
  contracts: ContractItem[];
  properties: PropertyItem[];
  allCharges: Charge[];
  charge?: Charge | null;
  onRefreshData: () => Promise<void>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [contractId, setContractId] = useState(String(charge?.contract_id ?? contracts[0]?.id ?? ""));
  const [concept, setConcept] = useState(charge?.concept ?? "UTE");
  const [amount, setAmount] = useState(charge ? String(charge.amount) : "");
  const [dueDate, setDueDate] = useState(charge?.due_date ?? todayIso());
  const [description, setDescription] = useState(charge?.description ?? "");
  const [period, setPeriod] = useState(charge?.period || currentPeriod());
  const [accrualPeriod, setAccrualPeriod] = useState(charge?.accrual_period || charge?.period || currentPeriod());
  const [settlementPeriod, setSettlementPeriod] = useState(charge?.settlement_period || charge?.period || currentPeriod());
  const [notifyTenant, setNotifyTenant] = useState(charge?.notify_tenant ?? false);
  const [notifyAlways, setNotifyAlways] = useState(charge?.notify_always ?? false);
  const [consumptionStart, setConsumptionStart] = useState(charge?.consumption_period_start ?? "");
  const [consumptionEnd, setConsumptionEnd] = useState(charge?.consumption_period_end ?? "");
  const [applyProration, setApplyProration] = useState(Boolean(charge?.proration_total_days));
  const [prorationBaseAmount, setProrationBaseAmount] = useState(inferProrationBaseAmount(charge));
  const [createProrationDifferenceOwnerCharge, setCreateProrationDifferenceOwnerCharge] = useState(false);
  const [prorationDifferencePaidByAgency, setProrationDifferencePaidByAgency] = useState(false);
  const [createOwnerCharge, setCreateOwnerCharge] = useState(Boolean(charge?.owner_charge_id));
  const [ownerChargeConcept, setOwnerChargeConcept] = useState(charge?.concept ?? "OTROS");
  const [ownerChargePaidByAgency, setOwnerChargePaidByAgency] = useState(false);
  const [ownerChargeSplitByOwnership, setOwnerChargeSplitByOwnership] = useState(true);
  const [registerPaymentNow, setRegisterPaymentNow] = useState(false);
  const [immediatePaymentDate, setImmediatePaymentDate] = useState(todayIso());
  const [immediatePaymentMethod, setImmediatePaymentMethod] = useState("transferencia");
  const [immediatePaymentReference, setImmediatePaymentReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [associationLoading, setAssociationLoading] = useState(false);
  const [scanResult, setScanResult] = useState<InvoiceScanResult | null>(null);
  const [scanError, setScanError] = useState("");
  const [formError, setFormError] = useState("");
  const [propertyIdForAccount, setPropertyIdForAccount] = useState(String(properties[0]?.id ?? ""));
  const selected = contracts.find((contract) => String(contract.id) === contractId);
  const prorationPreview = calculateProrationPreview(prorationBaseAmount, consumptionStart, consumptionEnd, selected);
  const tenantChargeConceptOptions = charge?.concept && !tenantConcepts.includes(charge.concept)
    ? [charge.concept, ...tenantConcepts]
    : tenantConcepts;
  const usesSeparateSettlementPeriod = concept === "GASTOS_COMUNES";

  useEffect(() => {
    if (applyProration && prorationPreview) {
      setAmount(String(prorationPreview.amount));
    }
  }, [applyProration, prorationPreview?.amount]);

  useEffect(() => {
    if (!usesSeparateSettlementPeriod) {
      setSettlementPeriod(accrualPeriod || period);
    }
  }, [usesSeparateSettlementPeriod, accrualPeriod, period]);

  async function analyzeInvoice(file: File) {
    setScanLoading(true);
    setScanError("");
    try {
      const result = await api.analyzeInvoice(file);
      setScanResult(result);
      if (result.matched_contract_id) {
        setContractId(String(result.matched_contract_id));
      }
      if (result.matched_property_id) {
        setPropertyIdForAccount(String(result.matched_property_id));
      }
      if (result.concept) {
        setConcept(result.concept);
      }
      if (result.amount) {
        setAmount(String(result.amount));
        setProrationBaseAmount(String(result.amount));
      }
      if (result.due_date) {
        setDueDate(result.due_date);
      }
      if (result.period) {
        setPeriod(result.period);
        setAccrualPeriod(result.period);
        setSettlementPeriod(result.period);
      }
      if (result.consumption_period_start) {
        setConsumptionStart(result.consumption_period_start);
      }
      if (result.consumption_period_end) {
        setConsumptionEnd(result.consumption_period_end);
      }
      if (result.consumption_period_start && result.consumption_period_end) {
        setApplyProration(true);
      }
      setDescription(result.description || `Factura ${result.provider}`);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "No se pudo analizar la factura");
    } finally {
      setScanLoading(false);
    }
  }

  async function associateDetectedAccount() {
    if (!scanResult?.account || !propertyIdForAccount) return;
    setAssociationLoading(true);
    setScanError("");
    try {
      const response = await api.associatePropertyAccount(Number(propertyIdForAccount), {
        provider: scanResult.concept,
        account: scanResult.account
      });
      await onRefreshData();
      if (response.matched_contract) {
        setContractId(String(response.matched_contract.id));
      }
      setScanResult({
        ...scanResult,
        matched_property_id: response.property.id,
        matched_property_reference: response.property.reference,
        matched_property_address: response.property.address,
        matched_contract_id: response.matched_contract?.id ?? null,
        matched_tenant_id: response.matched_contract?.tenant_id ?? null,
        matched_tenant_name: response.matched_contract?.tenant_name ?? "",
        matched_account: scanResult.account
      });
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "No se pudo asociar la cuenta");
    } finally {
      setAssociationLoading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const duplicate = allCharges.find((item) => {
      if (charge && item.id === charge.id) return false;
      return item.concept === concept && item.property_reference === selected.property_reference && (item.period || "") === (period || "");
    });
    if (duplicate && !window.confirm(`Ya existe una deuda de ${concept} para la finca ${selected.property_reference} en el periodo ${period || "sin periodo"}. ¿Querés cargarla igual?`)) {
      return;
    }
    setLoading(true);
    setFormError("");
    try {
      const payload = {
        contract_id: selected.id,
        responsible_person_id: selected.tenant_id,
        concept,
        description,
        amount: Number(amount),
        due_date: dueDate,
        period,
        accrual_period: accrualPeriod,
	        settlement_period: usesSeparateSettlementPeriod ? settlementPeriod : (accrualPeriod || period),
	        responsible_type: "tenant",
	        notify_tenant: notifyTenant,
	        notify_always: notifyAlways,
	        consumption_period_start: consumptionStart || null,
	        consumption_period_end: consumptionEnd || null,
	        apply_proration: applyProration,
	        proration_base_amount: applyProration ? Number(prorationBaseAmount || amount) : null,
	        create_owner_charge_for_proration_difference: applyProration && createProrationDifferenceOwnerCharge,
	        proration_difference_paid_by_agency: prorationDifferencePaidByAgency,
	        create_owner_charge: createOwnerCharge && !charge?.owner_charge_id,
	        owner_charge_concept: ownerChargeConcept,
	        owner_charge_paid_by_agency: ownerChargePaidByAgency,
        owner_charge_split_by_ownership: ownerChargeSplitByOwnership,
        origin: charge?.origin ?? (scanResult ? "importado" : "manual"),
        allow_duplicate: Boolean(duplicate)
      };
      let savedCharge: Charge;
      try {
        if (charge) {
          savedCharge = await api.updateCharge(charge.id, payload);
        } else {
          savedCharge = await api.createCharge(payload);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo guardar";
        if (message.toLowerCase().includes("posible duplicado") && window.confirm(`${message}\n\n¿Querés guardar igual?`)) {
          const duplicatePayload = { ...payload, allow_duplicate: true };
          savedCharge = charge ? await api.updateCharge(charge.id, duplicatePayload) : await api.createCharge(duplicatePayload);
        } else {
          throw error;
        }
      }
      if (!charge && registerPaymentNow && Number(amount) > 0) {
        await api.createPayment({
          person_id: selected.tenant_id,
          amount: Number(amount),
          payment_date: immediatePaymentDate,
          method: immediatePaymentMethod,
          reference: immediatePaymentReference,
          notes: "Pago registrado al guardar la deuda",
          allocations: [{ charge_id: savedCharge.id, amount: Number(amount) }]
        });
      }
      await onSaved();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo guardar la deuda");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title={charge ? "Editar deuda" : "Nueva deuda"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {formError && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{formError}</p>}
        <div className="rounded-lg border border-teal-100 bg-teal-50/70 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand" />
                <p className="font-semibold text-ink">Carga rápida por factura</p>
              </div>
              <p className="mt-1 text-sm text-muted">Adjuntá foto o PDF, revisá y guardá la deuda.</p>
            </div>
            <label className="btn-secondary cursor-pointer justify-center">
              {scanLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileImage className="h-4 w-4" />}
              Adjuntar factura
              <input
                className="hidden"
                type="file"
                accept="image/*,.txt,.pdf"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    analyzeInvoice(file);
                  }
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>
          {scanError && <p className="mt-3 rounded-md bg-rose-50 p-2 text-sm text-rose-700">{scanError}</p>}
          {scanResult && (
            <div className="mt-3 grid gap-3 rounded-md border border-teal-100 bg-white p-3 text-sm md:grid-cols-4">
              <MiniStat label="Proveedor" value={scanResult.provider} />
              <MiniStat label="Confianza" value={`${scanResult.confidence}%`} />
	              <MiniStat label="Cuenta" value={scanResult.account || "No detectada"} />
	              <MiniStat label="Periodo" value={scanResult.period || "Sin periodo"} />
	              <MiniStat
	                label="Sugerencia"
	                value={scanResult.matched_tenant_name || "Revisar contrato"}
	              />
	              {(scanResult.reference_number || scanResult.meter_number || scanResult.consumption_amount) && (
	                <p className="md:col-span-4 text-xs text-muted">
	                  {scanResult.reference_number ? `Ref ${scanResult.reference_number}` : ""}
	                  {scanResult.meter_number ? ` · Medidor ${scanResult.meter_number}` : ""}
	                  {scanResult.consumption_amount ? ` · Consumo ${scanResult.consumption_amount} ${scanResult.consumption_unit}` : ""}
	                </p>
	              )}
	              {scanResult.warnings.length > 0 && (
                <p className="md:col-span-4 text-xs text-amber-700">
                  {scanResult.warnings.join(" ")}
                </p>
              )}
              {scanResult.account && !scanResult.matched_contract_id && (
                <div className="md:col-span-4 grid gap-2 border-t border-teal-100 pt-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div>
                    <label className="form-label">Asociar cuenta detectada a propiedad</label>
                    <select className="input" value={propertyIdForAccount} onChange={(event) => setPropertyIdForAccount(event.target.value)}>
                      {properties.map((property) => (
                        <option key={property.id} value={property.id}>
                          {property.reference} · {property.address}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button className="btn-secondary justify-center" type="button" onClick={associateDetectedAccount} disabled={associationLoading || !propertyIdForAccount}>
                    {associationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
                    Asociar cuenta
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div>
          <label className="form-label">Contrato</label>
          <select className="input" value={contractId} onChange={(event) => setContractId(event.target.value)}>
            {contracts.map((contract) => (
              <option key={contract.id} value={contract.id}>
                {contractOptionLabel(contract)}
              </option>
            ))}
          </select>
          {selected && (
            <p className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-muted">
              Inq {selected.tenant_legacy_code || "s/n"} - {selected.tenant_name} · Fin {selected.property_reference || "s/n"} - {selected.property_address || "Sin dirección"}
            </p>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="form-label">Concepto</label>
            <select className="input" value={concept} onChange={(event) => setConcept(event.target.value)}>
              {tenantChargeConceptOptions.map((item) => <option key={item}>{item}</option>)}
            </select>
            <p className="mt-1 text-xs text-muted">Primaria, contribución y fondo de reserva se cargan como deuda/débito de propietario.</p>
          </div>
          <div>
            <label className="form-label">{applyProration ? "Monto a cobrar calculado" : "Monto"}</label>
            <input
              className="input"
              type="number"
              min="0"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              readOnly={applyProration}
              required
            />
          </div>
        </div>
        <div>
          <label className="form-label">Vencimiento</label>
          <input className="input" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </div>
	        <div className={`grid gap-3 ${usesSeparateSettlementPeriod ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          <div>
            <label className="form-label">Mes/año deuda</label>
            <input className="input" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
          </div>
          <div>
            <label className="form-label">Devengado</label>
            <input className="input" type="month" value={accrualPeriod} onChange={(event) => setAccrualPeriod(event.target.value)} />
          </div>
          {usesSeparateSettlementPeriod && (
            <div>
              <label className="form-label">Liquidación</label>
              <input className="input" type="month" value={settlementPeriod} onChange={(event) => setSettlementPeriod(event.target.value)} />
              <p className="mt-1 text-xs text-muted">Solo para gastos comunes cuando se liquida en otro mes.</p>
            </div>
          )}
	        </div>
	        <div className="grid gap-3 sm:grid-cols-2">
	          <div>
	            <label className="form-label">Consumo desde</label>
	            <input className="input" type="date" value={consumptionStart} onChange={(event) => setConsumptionStart(event.target.value)} />
	          </div>
	          <div>
	            <label className="form-label">Consumo hasta</label>
	            <input className="input" type="date" value={consumptionEnd} onChange={(event) => setConsumptionEnd(event.target.value)} />
	          </div>
	        </div>
	        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
	          <label className="flex items-center gap-2 text-sm font-semibold text-amber-900">
	            <input
	              type="checkbox"
	              checked={applyProration}
	              onChange={(event) => {
	                const checked = event.target.checked;
	                setApplyProration(checked);
	                if (checked && !prorationBaseAmount && amount) {
	                  setProrationBaseAmount(amount);
	                }
	              }}
	            />
	            Calcular prorrateo por días de ocupación
	          </label>
	          {applyProration && (
	            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_2fr]">
	              <div>
	                <label className="form-label">Monto total de la factura</label>
	                <input
	                  className="input bg-white"
	                  type="number"
	                  min="0"
	                  value={prorationBaseAmount}
	                  onChange={(event) => setProrationBaseAmount(event.target.value)}
	                  required={applyProration}
	                />
	              </div>
	              <div className="rounded-md border border-amber-100 bg-white p-3 text-sm text-slate-700">
	                <p className="font-semibold text-ink">Cálculo automático</p>
	                {!prorationPreview ? (
	                  <p className="mt-1 text-muted">Completá monto total, consumo desde/hasta y contrato para ver el cálculo.</p>
	                ) : (
	                  <div className="mt-1 space-y-1">
	                    <p>
	                      Días a cobrar: <strong>{prorationPreview.occupiedDays}/{prorationPreview.totalDays}</strong>
	                    </p>
	                    <p>
	                      Monto que queda en la deuda: <strong>{formatCurrency(prorationPreview.amount)}</strong>
	                    </p>
	                    <p>
	                      Diferencia no cobrada al inquilino: <strong>{formatCurrency(prorationPreview.difference)}</strong>
	                    </p>
	                    {prorationPreview.occupiedDays >= prorationPreview.totalDays ? (
	                      <p className="text-muted">No se prorratea porque el contrato cubre todo el período de consumo.</p>
	                    ) : (
	                      <p className="text-muted">Se cobra solo la parte del período en que el contrato estuvo vigente.</p>
	                    )}
	                    <p className="font-semibold text-amber-900">Guardar esta deuda no registra caja todavía.</p>
	                    <p className="text-muted">Caja registrará una entrada por {formatCurrency(prorationPreview.amount)} recién cuando se registre el pago de la inquilina.</p>
	                  </div>
	                )}
	              </div>
	              {prorationPreview && prorationPreview.difference > 0 && (
	                <div className="md:col-span-2 space-y-2 rounded-md border border-amber-100 bg-white p-3">
	                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
	                    <input
	                      type="checkbox"
	                      checked={createProrationDifferenceOwnerCharge}
	                      onChange={(event) => setCreateProrationDifferenceOwnerCharge(event.target.checked)}
	                    />
	                    Descontar la diferencia al propietario en la liquidación
	                  </label>
	                  {createProrationDifferenceOwnerCharge && (
	                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
	                      <input
	                        type="checkbox"
	                        checked={prorationDifferencePaidByAgency}
	                        onChange={(event) => setProrationDifferencePaidByAgency(event.target.checked)}
	                      />
	                      La inmobiliaria pagó esa diferencia y debe salir de caja
	                    </label>
	                  )}
	                  <p className="text-xs text-muted">
	                    Si lo marcás, se crea un débito al propietario por {formatCurrency(prorationPreview.difference)}. Si además marcás que la inmobiliaria lo pagó, se crea una salida de caja.
	                  </p>
	                </div>
	              )}
	            </div>
	          )}
	        </div>
	        <p className="rounded-md bg-slate-50 p-3 text-sm text-muted">
	          Esta deuda queda siempre a cargo del inquilino del contrato. Si el gasto corresponde al propietario, usá <strong>Nueva deuda propietario</strong>.
	        </p>
	        <div className="grid gap-3 sm:grid-cols-2">
	          <label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm font-semibold text-slate-700">
	            <input type="checkbox" checked={notifyTenant} onChange={(event) => setNotifyTenant(event.target.checked)} />
	            Notificar al inquilino
	          </label>
	          <label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm font-semibold text-slate-700">
	            <input type="checkbox" checked={notifyAlways} onChange={(event) => setNotifyAlways(event.target.checked)} />
	            Notificar siempre
	          </label>
	        </div>
	        {!charge && (
	          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
	            <label className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
	              <input type="checkbox" checked={registerPaymentNow} onChange={(event) => setRegisterPaymentNow(event.target.checked)} />
	              Registrar pago del inquilino ahora y mandarlo a caja
	            </label>
	            <p className="mt-1 text-xs text-emerald-800">
	              Si Lucía ya pagó, marcá esto: se guarda la deuda por {formatCurrency(Number(amount || 0))} y se crea una entrada de caja por ese mismo importe.
	            </p>
	            {registerPaymentNow && (
	              <div className="mt-3 grid gap-3 sm:grid-cols-3">
	                <div>
	                  <label className="form-label">Fecha pago</label>
	                  <input className="input bg-white" type="date" value={immediatePaymentDate} onChange={(event) => setImmediatePaymentDate(event.target.value)} />
	                </div>
	                <div>
	                  <label className="form-label">Método</label>
	                  <select className="input bg-white" value={immediatePaymentMethod} onChange={(event) => setImmediatePaymentMethod(event.target.value)}>
	                    <option value="transferencia">Transferencia</option>
	                    <option value="efectivo">Efectivo</option>
	                    <option value="redpagos">Redpagos</option>
	                    <option value="ANDA">ANDA</option>
	                    <option value="Contaduria">Contaduría</option>
	                  </select>
	                </div>
	                <div>
	                  <label className="form-label">Referencia</label>
	                  <input className="input bg-white" value={immediatePaymentReference} onChange={(event) => setImmediatePaymentReference(event.target.value)} placeholder="Comprobante" />
	                </div>
	              </div>
	            )}
	          </div>
	        )}
	        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
	          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
	            <input type="checkbox" checked={createOwnerCharge} onChange={(event) => setCreateOwnerCharge(event.target.checked)} disabled={Boolean(charge?.owner_charge_id)} />
	            También asociar/descontar al propietario
	          </label>
	          {charge?.owner_charge_id && <p className="mt-2 text-xs text-muted">Ya tiene débito propietario vinculado #{charge.owner_charge_id}.</p>}
	          {createOwnerCharge && !charge?.owner_charge_id && (
	            <div className="mt-3 grid gap-3 sm:grid-cols-2">
	              <select className="input" value={ownerChargeConcept} onChange={(event) => setOwnerChargeConcept(event.target.value)}>
	                {ownerConcepts.map((item) => <option key={item}>{item}</option>)}
	              </select>
	              <label className="flex items-center gap-2 rounded-md bg-white p-3 text-sm font-semibold text-slate-700">
	                <input type="checkbox" checked={ownerChargePaidByAgency} onChange={(event) => setOwnerChargePaidByAgency(event.target.checked)} />
	                La inmobiliaria lo pagó
	              </label>
	              <label className="flex items-center gap-2 rounded-md bg-white p-3 text-sm font-semibold text-slate-700 sm:col-span-2">
	                <input type="checkbox" checked={ownerChargeSplitByOwnership} onChange={(event) => setOwnerChargeSplitByOwnership(event.target.checked)} />
	                Repartir por porcentaje de propietarios
	              </label>
	            </div>
	          )}
	        </div>
	        <div>
          <label className="form-label">Descripción</label>
          <textarea className="input min-h-24" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ej: Factura UTE mayo, gasto común, tributos..." />
        </div>
        <button className="btn-primary w-full justify-center" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : charge ? <Edit3 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {charge ? "Actualizar deuda" : "Guardar deuda"}
        </button>
      </form>
    </Modal>
  );
}

function PaymentModal({
  charge,
  contracts,
  onClose,
  onSaved
}: {
  charge: Charge;
  contracts: ContractItem[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [amount, setAmount] = useState(String(charge.remaining_amount));
  const contract = contracts.find((item) => item.id === charge.contract_id) ?? null;
  const tenantOptions = (contract?.tenants ?? []).length
    ? contract?.tenants ?? []
    : [{ id: charge.responsible_person_id, legacy_code: charge.tenant_legacy_code, full_name: charge.tenant_name, document: "", mobile: charge.tenant_mobile, email: charge.tenant_email, phone: "" }];
  const [payerId, setPayerId] = useState(String(charge.responsible_person_id));
  const [method, setMethod] = useState("transferencia");
  const [reference, setReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      await api.createPayment({
        person_id: Number(payerId),
        amount: Number(amount),
        payment_date: paymentDate,
        method,
        reference,
        notes: "",
        allocations: [{ charge_id: charge.id, amount: Number(amount) }]
      });
      await onSaved();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Registrar pago" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-md bg-slate-50 p-3">
          <p className="font-semibold text-ink">{chargeTenantLabel(charge)}</p>
          <p className="text-sm text-muted">{charge.concept} · {chargePropertyLabel(charge)} · saldo {formatCurrency(charge.remaining_amount)}</p>
        </div>
        <div>
          <label className="form-label">Titular que paga</label>
          <select className="input" value={payerId} onChange={(event) => setPayerId(event.target.value)}>
            {tenantOptions.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                Inq {tenant.legacy_code || "s/n"} - {tenant.full_name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="form-label">Monto</label>
            <input className="input" type="number" min="1" max={charge.remaining_amount} value={amount} onChange={(event) => setAmount(event.target.value)} required />
          </div>
          <div>
            <label className="form-label">Fecha</label>
            <input className="input" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="form-label">Método</label>
            <select className="input" value={method} onChange={(event) => setMethod(event.target.value)}>
              <option value="transferencia">Transferencia</option>
              <option value="efectivo">Efectivo</option>
              <option value="redpagos">Redpagos</option>
              <option value="ANDA">ANDA</option>
	                    <option value="Contaduria">Contaduría</option>
            </select>
          </div>
          <div>
            <label className="form-label">Referencia</label>
            <input className="input" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="BROU, comprobante, nota" />
          </div>
        </div>
        <button className="btn-primary w-full justify-center" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
          Imputar pago
        </button>
      </form>
    </Modal>
  );
}

function BatchPaymentModal({
  person,
  charges,
  allCharges,
  contracts,
  credits,
  onClose,
  onSaved
}: {
  person: Person;
  charges: Charge[];
  allCharges: Charge[];
  contracts: ContractItem[];
  credits: TenantCredit[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [allocations, setAllocations] = useState<Record<number, string>>(
    () => Object.fromEntries(charges.map((charge) => [charge.id, String(charge.remaining_amount)])) as Record<number, string>
  );
  const [selectedChargeIds, setSelectedChargeIds] = useState<Record<number, boolean>>(
    () => Object.fromEntries(charges.map((charge) => [charge.id, true])) as Record<number, boolean>
  );
  const personContracts = useMemo(
    () => contracts.filter((contract) => {
      if (!contract.active) return false;
      if (contract.tenant_id === person.id) return true;
      return (contract.tenants ?? []).some((tenant) => tenant.id === person.id);
    }),
    [contracts, person.id]
  );
  const expectedRentItems = useMemo(() => {
    const duePeriods = Array.from({ length: 12 }, (_, index) => addMonthsToPeriod(currentPeriod(), index));
    return personContracts.flatMap((contract) => {
      return duePeriods
        .map((duePeriod) => rentPeriodForDuePeriod(duePeriod, contract.rent_payment_timing))
        .filter((period) => {
          const periodStart = `${period}-01`;
          if (contract.start_date && periodStart < contract.start_date.slice(0, 7) + "-01") return false;
          const billingEndDate = contract.billing_end_date || contract.end_date;
          if (billingEndDate && periodStart > billingEndDate.slice(0, 7) + "-01") return false;
          return !allCharges.some((charge) => {
            const chargePeriod = charge.period || charge.due_date.slice(0, 7);
            return charge.contract_id === contract.id && charge.concept === "ALQUILER" && chargePeriod === period;
          });
        })
        .map((period) => ({
          key: `${contract.id}-${period}`,
          contract,
          period,
          dueDate: periodDueDate(period, contract.rent_payment_timing),
          amount: contract.rent_amount
        }));
    });
  }, [allCharges, personContracts]);
  const [selectedExpectedRentKeys, setSelectedExpectedRentKeys] = useState<Record<string, boolean>>({});
  const [expectedRentAmounts, setExpectedRentAmounts] = useState<Record<string, string>>({});
  const expectedRentSignature = expectedRentItems.map((item) => item.key).join("|");
  useEffect(() => {
    setExpectedRentAmounts((current) => {
      const next = { ...current };
      for (const item of expectedRentItems) {
        if (next[item.key] === undefined) next[item.key] = String(item.amount);
      }
      return next;
    });
  }, [expectedRentSignature, expectedRentItems]);
  const candidatePayers = (() => {
    const seen = new Map<number, { id: number; legacy_code: string; full_name: string }>();
    for (const contract of personContracts) {
      for (const tenant of contract?.tenants ?? []) {
        if (!seen.has(tenant.id)) {
          seen.set(tenant.id, { id: tenant.id, legacy_code: tenant.legacy_code, full_name: tenant.full_name });
        }
      }
    }
    if (!seen.size) {
      seen.set(person.id, { id: person.id, legacy_code: person.legacy_code, full_name: person.full_name });
    }
    return Array.from(seen.values());
  })();
  const [payerId, setPayerId] = useState(() => String(candidatePayers[0]?.id ?? person.id));
  const [method, setMethod] = useState("transferencia");
  const [reference, setReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [isJudicial, setIsJudicial] = useState(false);
  const [showExtraCharge, setShowExtraCharge] = useState(false);
  const [extraChargeAmount, setExtraChargeAmount] = useState("");
  const [extraChargeDescription, setExtraChargeDescription] = useState("Otras comisiones");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const existingTotal = charges.reduce((sum, charge) => sum + (selectedChargeIds[charge.id] ? Number(allocations[charge.id] || 0) : 0), 0);
  const expectedTotal = expectedRentItems.reduce((sum, item) => sum + (selectedExpectedRentKeys[item.key] ? Number(expectedRentAmounts[item.key] || 0) : 0), 0);
  const extraChargeValue = showExtraCharge ? Number(extraChargeAmount || 0) : 0;
  const total = existingTotal + expectedTotal + extraChargeValue;
  const personCredits = credits.filter((credit) => credit.person_id === person.id && credit.remaining_amount > 0);
  const availableCreditTotal = personCredits.reduce((sum, credit) => sum + credit.remaining_amount, 0);
  const contextCharge = charges.find((charge) => selectedChargeIds[charge.id]) ?? charges[0];
  const contextExpected = expectedRentItems.find((item) => selectedExpectedRentKeys[item.key]) ?? expectedRentItems[0];
  const contextContract = contextExpected?.contract ?? contracts.find((contract) => contract.id === contextCharge?.contract_id) ?? personContracts[0];
  const headerProperty = contextCharge ? chargePropertyLabel(contextCharge) : contextContract ? `Fin ${contextContract.property_reference || "s/n"} - ${contextContract.property_address || "Sin dirección"}` : "Sin finca";
  const headerOwners = contextContract?.owners.map((owner) => `Prop - ${owner.full_name}`).join(", ") || "Sin propietario";
  const headerDueDate = contextCharge?.due_date ?? contextExpected?.dueDate ?? "según selección";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const applied = charges
      .filter((charge) => selectedChargeIds[charge.id])
      .map((charge) => ({ charge_id: charge.id, amount: Number(allocations[charge.id] || 0) }))
      .filter((item) => item.amount > 0);
    const expectedToCreate = expectedRentItems
      .filter((item) => selectedExpectedRentKeys[item.key])
      .map((item) => ({ ...item, amountToPay: Number(expectedRentAmounts[item.key] || 0) }))
      .filter((item) => item.amountToPay > 0);
    if (!applied.length && !expectedToCreate.length && extraChargeValue <= 0) {
      setError("Seleccioná al menos una deuda o alquiler esperado para cobrar.");
      return;
    }
    if (extraChargeValue < 0) {
      setError("El importe de otras comisiones no puede ser negativo.");
      return;
    }
    if (extraChargeValue > 0 && !contextContract) {
      setError("Para cargar otras comisiones necesitás un contrato/finca activa del inquilino.");
      return;
    }
    setLoading(true);
    try {
      const createdAllocations = [];
      for (const item of expectedToCreate) {
        const savedCharge = await api.createCharge({
          contract_id: item.contract.id,
          responsible_person_id: item.contract.tenant_id,
          concept: "ALQUILER",
          description: `Alquiler esperado ${periodMonthName(item.period)}`,
          amount: item.amount,
          due_date: item.dueDate,
          period: item.period,
          accrual_period: item.period,
          settlement_period: item.period,
          origin: "alquiler_esperado",
          allow_duplicate: false
        });
        createdAllocations.push({ charge_id: savedCharge.id, amount: item.amountToPay });
      }
      if (extraChargeValue > 0 && contextContract) {
        const savedExtraCharge = await api.createCharge({
          contract_id: contextContract.id,
          responsible_person_id: person.id,
          concept: "OTROS",
          description: extraChargeDescription || "Otras comisiones",
          amount: extraChargeValue,
          due_date: paymentDate,
          period: currentPeriod(),
          accrual_period: currentPeriod(),
          settlement_period: currentPeriod(),
          origin: "otras_comisiones_pago",
          allow_duplicate: true
        });
        createdAllocations.push({ charge_id: savedExtraCharge.id, amount: extraChargeValue });
      }
      await api.createPayment({
        person_id: Number(payerId),
        amount: total,
        payment_date: paymentDate,
        method,
        reference,
        notes: [notes || "Ingreso pago inquilino", isJudicial ? "Juicio: sí" : ""].filter(Boolean).join(" · "),
        allocations: [...applied, ...createdAllocations]
      });
      await onSaved();
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo registrar el pago");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Ingreso pago inquilino" onClose={onClose} size="wide">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 rounded-md bg-slate-50 p-3 md:grid-cols-3">
          <MiniStat label="Nº recibo" value="Automático al confirmar" />
          <MiniStat label="Fecha" value={paymentDate} />
          <MiniStat label="Inquilino" value={personOptionLabel(person)} />
          <MiniStat label="Finca" value={headerProperty} />
          <MiniStat label="Propietario" value={headerOwners} />
          <MiniStat label="Reajuste" value={contextContract?.next_reajustment_date || "Sin fecha"} />
          <MiniStat label="Vencimiento" value={headerDueDate} />
          <MiniStat label="Moneda" value="$ UYU" />
          <MiniStat label="Total a cobrar" value={formatCurrency(total)} />
        </div>
        {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <div>
          <label className="form-label">Titular que paga</label>
          <select className="input" value={payerId} onChange={(event) => setPayerId(event.target.value)}>
            {candidatePayers.map((payer) => (
              <option key={payer.id} value={payer.id}>
                Inq {payer.legacy_code || "s/n"} - {payer.full_name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <button type="button" className="btn-secondary justify-center" onClick={() => setShowExtraCharge((value) => !value)}>
            <Plus className="h-4 w-4" />
            Ing. débitos / Otras Com.
          </button>
          <div className="rounded-md border border-slate-200 p-3 text-sm">
            <p className="font-semibold text-ink">Créditos</p>
            <p className="text-muted">{personCredits.length ? `${formatCurrency(availableCreditTotal)} disponible` : "Sin saldo a favor"}</p>
          </div>
          <div className="rounded-md border border-slate-200 p-3 text-sm">
            <p className="font-semibold text-ink">Juicio</p>
            <label className="mt-1 flex items-center gap-2 text-muted">
              <input type="checkbox" checked={isJudicial} onChange={(event) => setIsJudicial(event.target.checked)} />
              Marcar este pago como juicio
            </label>
          </div>
        </div>
        {showExtraCharge && (
          <div className="grid gap-3 rounded-md bg-amber-50 p-3 sm:grid-cols-[1fr_160px]">
            <div>
              <label className="form-label">Descripción del débito/comisión</label>
              <input className="input" value={extraChargeDescription} onChange={(event) => setExtraChargeDescription(event.target.value)} placeholder="Otras comisiones, gastos administrativos..." />
            </div>
            <div>
              <label className="form-label">Importe</label>
              <input className="input" type="number" min="0" value={extraChargeAmount} onChange={(event) => setExtraChargeAmount(event.target.value)} />
            </div>
          </div>
        )}
        {personCredits.length > 0 && (
          <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
            <p className="font-semibold">Saldos a favor disponibles para controlar antes de cobrar</p>
            <p className="mt-1">
              {personCredits.map((credit) => `${formatCurrency(credit.remaining_amount)} (${credit.notes || `pago ${credit.payment_id ?? ""}`})`).join(" · ")}
            </p>
            <p className="mt-1 text-xs">Por seguridad no se descuenta automáticamente de caja: se muestra acá para decidir si corresponde imputarlo o registrarlo como pago.</p>
          </div>
        )}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <p className="font-semibold text-ink">Deudas y alquileres para cobrar</p>
            <p className="text-xs text-muted">Marcá `Paga` solo en las filas que querés cobrar. Las filas azules son alquileres esperados: se crean como deuda real recién cuando confirmás el ingreso.</p>
          </div>
          <div className="overflow-auto">
          <table className="min-w-[980px] divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase tracking-[0.12em] text-muted">
              <tr>
                <th className="w-16 px-4 py-3 text-center">Paga</th>
                <th className="w-32 px-4 py-3">Vence</th>
                <th className="min-w-80 px-4 py-3">Concepto / detalle</th>
                <th className="w-28 px-4 py-3">Mes/año</th>
                <th className="w-36 px-4 py-3">Estado</th>
                <th className="w-32 px-4 py-3 text-right">Importe</th>
                <th className="w-40 px-4 py-3 text-right">Monto a cobrar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {charges.map((charge) => (
                <tr key={charge.id} className={selectedChargeIds[charge.id] ? "" : "opacity-60"}>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={selectedChargeIds[charge.id] ?? false}
                      onChange={(event) => setSelectedChargeIds((current) => ({ ...current, [charge.id]: event.target.checked }))}
                      aria-label={`Seleccionar deuda ${charge.concept}`}
                    />
                  </td>
                  <td className="px-4 py-3">{formatIsoDate(charge.due_date)}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">{charge.concept}</p>
                    <p className="text-xs text-muted">{chargePropertyLabel(charge)}</p>
                    <p className="text-xs text-muted">{charge.description || "Sin descripción"}</p>
                  </td>
                  <td className="px-4 py-3">{formatPeriodShort(chargePeriodLabel(charge))}</td>
                  <td className="px-4 py-3"><StatusBadge status={charge.status} /></td>
                  <td className="px-4 py-3 text-right">{formatCurrency(charge.amount)}</td>
                  <td className="px-4 py-3 text-right">
                    <input
                      className="input min-w-32 text-right"
                      type="number"
                      min="0"
                      max={charge.remaining_amount}
                      value={allocations[charge.id] ?? ""}
                      onChange={(event) => setAllocations((current) => ({ ...current, [charge.id]: event.target.value }))}
                      disabled={!selectedChargeIds[charge.id]}
                    />
                  </td>
                </tr>
              ))}
              {expectedRentItems.map((item) => (
                <tr key={item.key} className={`${selectedExpectedRentKeys[item.key] ? "bg-blue-50/70" : "bg-blue-50/40 opacity-70"}`}>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={selectedExpectedRentKeys[item.key] ?? false}
                      onChange={(event) => setSelectedExpectedRentKeys((current) => ({ ...current, [item.key]: event.target.checked }))}
                      aria-label={`Seleccionar alquiler esperado ${item.period}`}
                    />
                  </td>
                  <td className="px-4 py-3">{formatIsoDate(item.dueDate)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink">ALQUILER</p>
                      <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">Alquiler esperado</span>
                    </div>
                    <p className="text-xs text-muted">Fin {item.contract.property_reference || "s/n"} - {item.contract.property_address}</p>
                    <p className="mt-1 rounded-md bg-white/70 px-2 py-1 text-xs font-medium text-blue-800">
                      Esta fila todavía no es una deuda real. Si la marcás y confirmás, el sistema crea el alquiler y registra el pago.
                    </p>
                  </td>
                  <td className="px-4 py-3">{formatPeriodShort(item.period)}</td>
                  <td className="px-4 py-3"><span className="rounded-md bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">Esperado</span></td>
                  <td className="px-4 py-3 text-right">{formatCurrency(item.amount)}</td>
                  <td className="px-4 py-3 text-right">
                    <input
                      className="input min-w-32 text-right"
                      type="number"
                      min="0"
                      value={expectedRentAmounts[item.key] ?? ""}
                      onChange={(event) => setExpectedRentAmounts((current) => ({ ...current, [item.key]: event.target.value }))}
                      disabled={!selectedExpectedRentKeys[item.key]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {!charges.length && !expectedRentItems.length && (
            <div className="p-4">
              <EmptyState title="Sin deudas para cobrar" detail="Este inquilino no tiene deudas abiertas ni alquileres esperados disponibles para crear." />
            </div>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="form-label">Fecha</label>
            <input className="input" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
          </div>
          <div>
            <label className="form-label">Método</label>
            <select className="input" value={method} onChange={(event) => setMethod(event.target.value)}>
              <option value="transferencia">Transferencia</option>
              <option value="efectivo">Efectivo</option>
              <option value="redpagos">Redpagos</option>
              <option value="ANDA">ANDA</option>
              <option value="Contaduria">Contaduría</option>
            </select>
          </div>
          <div>
            <label className="form-label">Referencia</label>
            <input className="input" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Comprobante" />
          </div>
        </div>
        <div>
            <label className="form-label">Observaciones</label>
            <textarea className="input min-h-20" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Observaciones del recibo o del pago" />
        </div>
        <button className="btn-primary w-full justify-center" disabled={loading || total <= 0}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
          Confirmar ingreso por {formatCurrency(total)}
        </button>
      </form>
    </Modal>
  );
}

function ReminderModal({ charges, onClose }: { charges: Charge[]; onClose: () => void }) {
  const [message, setMessage] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [loading, setLoading] = useState(true);
  const [sent, setSent] = useState(false);
  const chargeIds = useMemo(() => charges.map((charge) => charge.id), [charges]);
  const firstCharge = charges[0];

  useEffect(() => {
    api
      .previewReminder({ charge_ids: chargeIds, channel: "whatsapp" })
      .then((response) => {
        setMessage(response.message);
        setWhatsapp(response.whatsapp_url);
      })
      .finally(() => setLoading(false));
  }, [chargeIds]);

  async function simulate() {
    const response = await api.simulateReminder({ charge_ids: chargeIds, channel: "whatsapp" });
    setMessage(response.message);
    setWhatsapp(response.whatsapp_url);
    setSent(true);
  }

  return (
    <Modal title="Recordatorio" onClose={onClose}>
      {loading ? (
        <div className="flex justify-center p-6"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-md bg-slate-50 p-3">
            <p className="font-semibold text-ink">{firstCharge?.tenant_name}</p>
            <p className="text-sm text-muted">{charges.length} deuda(s) incluidas</p>
          </div>
          <textarea className="input min-h-48" value={message} onChange={(event) => setMessage(event.target.value)} />
          {sent && <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-700">Envío simulado registrado.</p>}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button className="btn-secondary flex-1 justify-center" onClick={() => navigator.clipboard.writeText(message)}>
              <Copy className="h-4 w-4" />
              Copiar
            </button>
            <a className="btn-secondary flex-1 justify-center" href={whatsapp} target="_blank" rel="noreferrer">
              <MessageCircle className="h-4 w-4" />
              Abrir WhatsApp
            </a>
            <button className="btn-primary flex-1 justify-center" onClick={simulate}>
              <Send className="h-4 w-4" />
              Simular envío
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function LinkModal({
  charges,
  publicLink,
  setPublicLink,
  onClose
}: {
  charges: Charge[];
  publicLink: string;
  setPublicLink: (value: string) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const firstCharge = charges[0];
  const total = charges.reduce((sum, charge) => sum + charge.remaining_amount, 0);

  async function create() {
    if (!firstCharge) return;
    setLoading(true);
    try {
      const response = await api.createPublicLink({
        person_id: firstCharge.responsible_person_id,
        charge_ids: charges.map((charge) => charge.id),
        days_valid: 14
      });
      setPublicLink(response.url);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Link público" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-md bg-slate-50 p-3">
          <p className="font-semibold text-ink">{firstCharge?.tenant_name}</p>
          <p className="text-sm text-muted">{charges.length} deuda(s) · {formatCurrency(total)}</p>
        </div>
        {!publicLink ? (
          <button className="btn-primary w-full justify-center" onClick={create} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
            Generar link
          </button>
        ) : (
          <div className="space-y-3">
            <input className="input" readOnly value={publicLink} />
            <div className="flex gap-2">
              <button className="btn-secondary flex-1 justify-center" onClick={() => navigator.clipboard.writeText(publicLink)}>
                <Copy className="h-4 w-4" />
                Copiar
              </button>
              <a className="btn-primary flex-1 justify-center" href={publicLink} target="_blank" rel="noreferrer">
                <LinkIcon className="h-4 w-4" />
                Abrir
              </a>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function PersonModal({
  person,
  defaultType,
  onClose,
  onSaved
}: {
  person: Person | null;
  defaultType?: Person["person_type"];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [fullName, setFullName] = useState(person?.full_name ?? "");
  const [legacyCode, setLegacyCode] = useState(person?.legacy_code ?? "");
  const [document, setDocument] = useState(person?.document ?? "");
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [mobile, setMobile] = useState(person?.mobile ?? "");
  const [email, setEmail] = useState(person?.email ?? "");
  const [address, setAddress] = useState(person?.address ?? "");
  const [personType, setPersonType] = useState<Person["person_type"]>(person?.person_type ?? defaultType ?? "tenant");
  const [bankName, setBankName] = useState(person?.bank_name ?? "");
  const [bankAccount, setBankAccount] = useState(person?.bank_account ?? "");
  const [bankTransferCommissionApplies, setBankTransferCommissionApplies] = useState(person?.bank_transfer_commission_applies ?? false);
  const [bankTransferCommissionAmount, setBankTransferCommissionAmount] = useState(String(person?.bank_transfer_commission_amount ?? 65));
  const [loading, setLoading] = useState(false);
  const showOwnerBankFields = personType !== "tenant";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const payload = {
        full_name: fullName,
        legacy_code: legacyCode,
        document,
        phone,
        mobile,
        email,
        address,
        person_type: personType,
        bank_name: showOwnerBankFields ? bankName : "",
        bank_account: showOwnerBankFields ? bankAccount : "",
        bank_transfer_commission_applies: showOwnerBankFields ? bankTransferCommissionApplies : false,
        bank_transfer_commission_amount: Number(bankTransferCommissionAmount || 0)
      };
      if (person) {
        await api.updatePerson(person.id, payload);
      } else {
        await api.createPerson(payload);
      }
      await onSaved();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title={person ? "Editar persona" : "Nueva persona"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="form-label">Nombre</label>
          <input className="input" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="form-label">Código Abaco</label>
            <input className="input" value={legacyCode} onChange={(event) => setLegacyCode(event.target.value)} />
          </div>
          <div>
            <label className="form-label">Cédula/RUT</label>
            <input className="input" value={document} onChange={(event) => setDocument(event.target.value)} />
          </div>
        </div>
        <div>
          <label className="form-label">Tipo</label>
          <select
            className="input"
            value={personType}
            onChange={(event) => {
              const nextType = event.target.value as Person["person_type"];
              setPersonType(nextType);
              if (nextType === "tenant") {
                setBankTransferCommissionApplies(false);
              } else if (bankName && !isBrouBankName(bankName)) {
                setBankTransferCommissionApplies(true);
              }
            }}
          >
            <option value="tenant">Inquilino</option>
            <option value="owner">Propietario</option>
            <option value="both">Ambos</option>
          </select>
        </div>
        {showOwnerBankFields && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="font-semibold text-ink">Transferencia al propietario</p>
            <p className="mt-1 text-sm text-muted">Si no cobra por BROU, el sistema puede descontar automáticamente la comisión bancaria en la liquidación.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="form-label">Banco</label>
                <input
                  className="input"
                  value={bankName}
                  onChange={(event) => {
                    const nextBank = event.target.value;
                    setBankName(nextBank);
                    setBankTransferCommissionApplies(Boolean(nextBank && !isBrouBankName(nextBank)));
                  }}
                  placeholder="BROU, Itaú, Santander..."
                />
              </div>
              <div>
                <label className="form-label">Cuenta / referencia</label>
                <input className="input" value={bankAccount} onChange={(event) => setBankAccount(event.target.value)} placeholder="Caja de ahorro, cuenta o alias" />
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_160px] sm:items-end">
              <label className="flex items-center gap-2 rounded-md bg-white p-3 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={bankTransferCommissionApplies} onChange={(event) => setBankTransferCommissionApplies(event.target.checked)} />
                Descontar comisión bancaria
              </label>
              <div>
                <label className="form-label">Importe</label>
                <input className="input" type="number" min="0" value={bankTransferCommissionAmount} onChange={(event) => setBankTransferCommissionAmount(event.target.value)} disabled={!bankTransferCommissionApplies} />
              </div>
            </div>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="form-label">Celular</label>
            <input className="input" value={mobile} onChange={(event) => setMobile(event.target.value)} />
          </div>
          <div>
            <label className="form-label">Teléfono</label>
            <input className="input" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </div>
        </div>
        <div>
          <label className="form-label">Email</label>
          <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        <div>
          <label className="form-label">Dirección</label>
          <input className="input" value={address} onChange={(event) => setAddress(event.target.value)} />
        </div>
        <button className="btn-primary w-full justify-center" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : person ? <Edit3 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {person ? "Actualizar persona" : "Guardar persona"}
        </button>
      </form>
    </Modal>
  );
}

type PropertyOwnerShareForm = {
  rowId: string;
  ownerId: string;
  percentage: string;
  irpfApplies: boolean;
};

function PropertyModal({
  property,
  owners,
  onClose,
  onSaved
}: {
  property: PropertyItem | null;
  owners: Person[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [reference, setReference] = useState(property?.reference ?? "");
  const [legacyCode, setLegacyCode] = useState(property?.legacy_code ?? "");
  const [address, setAddress] = useState(property?.address ?? "");
  const [doorNumber, setDoorNumber] = useState(property?.door_number ?? "");
  const [unitNumber, setUnitNumber] = useState(property?.unit_number ?? "");
  const [padron, setPadron] = useState(property?.padron ?? "");
  const [occupancyStatus, setOccupancyStatus] = useState(property?.occupancy_status ?? "alquilada");
  const [propertyType, setPropertyType] = useState(property?.property_type ?? "");
  const [destination, setDestination] = useState(property?.destination ?? "");
  const [uteAccount, setUteAccount] = useState(property?.ute_account ?? "");
  const [oseAccount, setOseAccount] = useState(property?.ose_account ?? "");
  const [taxesAccount, setTaxesAccount] = useState(property?.taxes_account ?? "");
  const [sanitationAccount, setSanitationAccount] = useState(property?.sanitation_account ?? "");
  const [notes, setNotes] = useState(property?.notes ?? "");
  const [ownerShares, setOwnerShares] = useState<PropertyOwnerShareForm[]>(() => {
    if (property?.owners.length) {
      return property.owners.map((owner) => ({
        rowId: `existing-${owner.id}`,
        ownerId: String(owner.id),
        percentage: String(owner.percentage),
        irpfApplies: owner.irpf_applies !== false
      }));
    }
    return owners[0]
      ? [{ rowId: `new-${owners[0].id}`, ownerId: String(owners[0].id), percentage: "100", irpfApplies: true }]
      : [];
  });
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const selectedOwnerIds = ownerShares.map((share) => share.ownerId).filter(Boolean);
  const ownerTotal = ownerShares.reduce((sum, share) => sum + Number(share.percentage || 0), 0);
  const duplicateOwner = selectedOwnerIds.some((ownerId, index) => selectedOwnerIds.indexOf(ownerId) !== index);
  const ownershipError = (() => {
    const filledShares = ownerShares.filter((share) => share.ownerId);
    if (!filledShares.length) return "";
    if (duplicateOwner) return "No repitas el mismo propietario en la finca.";
    if (filledShares.some((share) => Number(share.percentage || 0) <= 0)) return "Cada propietario debe tener un porcentaje mayor a 0.";
    if (Math.abs(ownerTotal - 100) > 0.01) return `Los porcentajes deben sumar 100%. Ahora suman ${ownerTotal || 0}%.`;
    return "";
  })();

  function addOwnerShare() {
    const availableOwner = owners.find((owner) => !selectedOwnerIds.includes(String(owner.id)));
    if (!availableOwner) return;
    const remainingPercentage = Math.max(100 - ownerTotal, 0);
    setOwnerShares((current) => [
      ...current,
      {
        rowId: `new-${availableOwner.id}-${Date.now()}`,
        ownerId: String(availableOwner.id),
        percentage: remainingPercentage ? String(remainingPercentage) : "",
        irpfApplies: true
      }
    ]);
  }

  function updateOwnerShare(rowId: string, values: Partial<PropertyOwnerShareForm>) {
    setOwnerShares((current) => current.map((share) => (share.rowId === rowId ? { ...share, ...values } : share)));
  }

  function removeOwnerShare(rowId: string) {
    setOwnerShares((current) => current.filter((share) => share.rowId !== rowId));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (ownershipError) {
      setFormError(ownershipError);
      return;
    }
    setLoading(true);
    setFormError("");
    try {
      const ownerPayload = ownerShares
        .filter((share) => share.ownerId)
        .map((share, index) => ({
          owner_id: Number(share.ownerId),
          percentage: Number(share.percentage || 0),
          is_primary: index === 0,
          irpf_applies: share.irpfApplies
        }));
      const payload = {
        legacy_code: legacyCode,
        reference,
        address,
        door_number: doorNumber,
        unit_number: unitNumber,
        padron,
        occupancy_status: occupancyStatus,
        property_type: propertyType,
        destination,
        ute_account: uteAccount,
        ose_account: oseAccount,
        taxes_account: taxesAccount,
        sanitation_account: sanitationAccount,
        notes,
        owner_shares: ownerPayload
      };
      if (property) {
        await api.updateProperty(property.id, payload);
      } else {
        await api.createProperty(payload);
      }
      await onSaved();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo guardar la propiedad");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title={property ? "Editar propiedad" : "Nueva propiedad"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="form-label">Referencia</label>
            <input className="input" value={reference} onChange={(event) => setReference(event.target.value)} required />
          </div>
          <div>
            <label className="form-label">Código Abaco</label>
            <input className="input" value={legacyCode} onChange={(event) => setLegacyCode(event.target.value)} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="form-label">Padrón</label>
            <input className="input" value={padron} onChange={(event) => setPadron(event.target.value)} />
          </div>
          <div>
            <label className="form-label">Estado</label>
            <select className="input" value={occupancyStatus} onChange={(event) => setOccupancyStatus(event.target.value)}>
              <option value="alquilada">Alquilada</option>
              <option value="desocupada">Desocupada</option>
              <option value="reservada">Reservada</option>
              <option value="inactiva">Inactiva</option>
            </select>
          </div>
          <div>
            <label className="form-label">Destino</label>
            <input className="input" value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="vivienda, local..." />
          </div>
        </div>
        <div>
          <label className="form-label">Tipo</label>
          <input className="input" value={propertyType} onChange={(event) => setPropertyType(event.target.value)} placeholder="apartamento, casa, local comercial" />
        </div>
        <div>
          <label className="form-label">Dirección</label>
          <input className="input" value={address} onChange={(event) => setAddress(event.target.value)} required />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="form-label">Número de puerta</label>
            <input className="input" value={doorNumber} onChange={(event) => setDoorNumber(event.target.value)} placeholder="Ej: 5449 bis" />
          </div>
          <div>
            <label className="form-label">Apto / unidad / local</label>
            <input className="input" value={unitNumber} onChange={(event) => setUnitNumber(event.target.value)} placeholder="Ej: Apto 301, local 2" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="form-label">Cuenta UTE</label>
            <input className="input" value={uteAccount} onChange={(event) => setUteAccount(event.target.value)} />
          </div>
          <div>
            <label className="form-label">Cuenta OSE</label>
            <input className="input" value={oseAccount} onChange={(event) => setOseAccount(event.target.value)} />
          </div>
          <div>
            <label className="form-label">Tributos</label>
            <input className="input" value={taxesAccount} onChange={(event) => setTaxesAccount(event.target.value)} />
          </div>
          <div>
            <label className="form-label">Saneamiento</label>
            <input className="input" value={sanitationAccount} onChange={(event) => setSanitationAccount(event.target.value)} />
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-ink">Propietarios y porcentajes</p>
              <p className="text-sm text-muted">Podés asociar uno o más propietarios. Para liquidar bien, el total debe sumar 100%.</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${Math.abs(ownerTotal - 100) <= 0.01 || !ownerShares.length ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
              Total {ownerTotal || 0}%
            </span>
          </div>
          <div className="space-y-2">
            {ownerShares.map((share) => {
              const availableOwners = owners.filter((owner) => !selectedOwnerIds.includes(String(owner.id)) || String(owner.id) === share.ownerId);
              return (
                <div key={share.rowId} className="grid gap-2 rounded-md border border-slate-200 bg-white p-2 md:grid-cols-[1fr_9rem_auto_auto] md:items-center">
                  <select className="input" value={share.ownerId} onChange={(event) => updateOwnerShare(share.rowId, { ownerId: event.target.value })}>
                    <option value="">Seleccionar propietario</option>
                    {availableOwners.map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {personOptionLabel(owner)}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input"
                    type="number"
                    min="0.01"
                    max="100"
                    step="0.01"
                    value={share.percentage}
                    onChange={(event) => updateOwnerShare(share.rowId, { percentage: event.target.value })}
                    placeholder="%"
                  />
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={share.irpfApplies}
                      onChange={(event) => updateOwnerShare(share.rowId, { irpfApplies: event.target.checked })}
                    />
                    IRPF aplica
                  </label>
                  <button className="icon-action" type="button" title="Quitar propietario" onClick={() => removeOwnerShare(share.rowId)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
          {!ownerShares.length && (
            <p className="rounded-md bg-white p-3 text-sm text-muted">Esta finca quedará sin propietario asociado por ahora.</p>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <button className="btn-secondary" type="button" onClick={addOwnerShare} disabled={!owners.length || selectedOwnerIds.length >= owners.length}>
              <Plus className="h-4 w-4" />
              Agregar propietario
            </button>
            {ownershipError && <span className="text-sm font-semibold text-amber-800">{ownershipError}</span>}
          </div>
        </div>
        <div>
          <label className="form-label">Notas</label>
          <textarea className="input min-h-20" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </div>
        {formError && <p className="rounded-md bg-rose-50 p-3 text-sm font-semibold text-rose-700">{formError}</p>}
        <button className="btn-primary w-full justify-center" disabled={loading || Boolean(ownershipError)}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : property ? <Edit3 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {property ? "Actualizar propiedad" : "Guardar propiedad"}
        </button>
      </form>
    </Modal>
  );
}

function ContractModal({
  contract,
  properties,
  tenants,
  onClose,
  onSaved
}: {
  contract: ContractItem | null;
  properties: PropertyItem[];
  tenants: Person[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [propertyId, setPropertyId] = useState(String(contract?.property_id ?? properties[0]?.id ?? ""));
  const initialTenantId = String(contract?.tenant_id ?? tenants[0]?.id ?? "");
  const initialExtraTenantIds = (contract?.tenants ?? [])
    .map((item) => String(item.id))
    .filter((item) => item && item !== initialTenantId);
  const [tenantId, setTenantId] = useState(initialTenantId);
  const [tenantIds, setTenantIds] = useState<string[]>(initialExtraTenantIds);
  const [legacyCode, setLegacyCode] = useState(contract?.legacy_code ?? "");
  const [startDate, setStartDate] = useState(contract?.start_date ?? todayIso());
  const [endDate, setEndDate] = useState(contract?.end_date ?? "");
  const [billingEndDate, setBillingEndDate] = useState(contract?.billing_end_date ?? "");
  const [rentAmount, setRentAmount] = useState(String(contract?.rent_amount ?? ""));
  const [paymentType, setPaymentType] = useState(contract?.payment_type ?? "adelantado");
  const [commissionPercent, setCommissionPercent] = useState(String(contract?.commission_percent ?? 8));
  const [commissionOnRent, setCommissionOnRent] = useState(contract?.commission_on_rent ?? true);
  const [commissionOnOtherCharges, setCommissionOnOtherCharges] = useState(contract?.commission_on_other_charges ?? false);
  const [commissionIvaApplies, setCommissionIvaApplies] = useState(contract?.commission_iva_applies ?? true);
  const [irpfApplies, setIrpfApplies] = useState(contract?.irpf_applies ?? true);
  const [irpfPercent, setIrpfPercent] = useState(String(contract?.irpf_percent ?? 10.5));
  const [paymentOrigin, setPaymentOrigin] = useState(contract?.payment_origin ?? "normal");
  const [tenantTaxRole, setTenantTaxRole] = useState(contract?.tenant_tax_role ?? "normal");
  const [resguardoRequired, setResguardoRequired] = useState(contract?.resguardo_required ?? false);
  const [rentPaymentTiming, setRentPaymentTiming] = useState(contract?.rent_payment_timing ?? "adelantado");
  const [guaranteeType, setGuaranteeType] = useState(contract?.guarantee_type ?? "sin_garantia");
  const [guaranteeProvider, setGuaranteeProvider] = useState(contract?.guarantee_provider ?? "");
  const [guaranteePercent, setGuaranteePercent] = useState(String(contract?.guarantee_percent ?? 0));
  const [rentRegime, setRentRegime] = useState(contract?.rent_regime ?? "libre_contratacion");
  const [reajustmentIndex, setReajustmentIndex] = useState(contract?.reajustment_index ?? "libre");
  const [nextReajustmentDate, setNextReajustmentDate] = useState(contract?.next_reajustment_date ?? "");
  const [active, setActive] = useState(contract?.active ?? true);
  const [createFirstRentCharge, setCreateFirstRentCharge] = useState(false);
  const [firstRentPeriod, setFirstRentPeriod] = useState((contract?.start_date ?? todayIso()).slice(0, 7));
  const [firstRentAmount, setFirstRentAmount] = useState("");
  const [firstRentDueDate, setFirstRentDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const firstRentSuggestedDueDate = suggestedFirstRentDueDate(startDate, firstRentPeriod, rentPaymentTiming);
  const firstRentError = (() => {
    if (!createFirstRentCharge) return "";
    if (!firstRentPeriod) return "Indicá el mes/año del primer alquiler.";
    if (Number(firstRentAmount || 0) <= 0) return "Indicá un importe mayor a cero para el primer alquiler.";
    return "";
  })();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!propertyId || !tenantId) return;
    setLoading(true);
    try {
      const payload = {
        property_id: Number(propertyId),
        tenant_id: Number(tenantId),
        tenant_ids: tenantIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0),
        legacy_code: legacyCode,
        start_date: startDate,
        end_date: endDate || null,
        billing_end_date: billingEndDate || null,
        rent_amount: Number(rentAmount),
        payment_type: paymentType,
        rent_payment_timing: rentPaymentTiming,
        guarantee_type: guaranteeType,
        guarantee_provider: guaranteeProvider,
        guarantee_percent: Number(guaranteePercent),
        rent_regime: rentRegime,
        reajustment_index: reajustmentIndex,
        next_reajustment_date: nextReajustmentDate || null,
        commission_percent: Number(commissionPercent),
        commission_on_rent: commissionOnRent,
        commission_on_other_charges: commissionOnOtherCharges,
        commission_iva_applies: commissionIvaApplies,
        irpf_applies: irpfApplies,
        irpf_percent: Number(irpfPercent),
        payment_origin: paymentOrigin,
        tenant_tax_role: tenantTaxRole,
        resguardo_required: resguardoRequired,
        active,
        create_first_rent_charge: createFirstRentCharge,
        first_rent_amount: createFirstRentCharge ? Number(firstRentAmount) : 0,
        first_rent_period: createFirstRentCharge ? firstRentPeriod : "",
        first_rent_due_date: createFirstRentCharge ? (firstRentDueDate || firstRentSuggestedDueDate) : null
      };
      if (contract) {
        await api.updateContract(contract.id, payload);
      } else {
        await api.createContract(payload);
      }
      await onSaved();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title={contract ? "Editar contrato" : "Nuevo contrato"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="form-label">Código contrato</label>
            <input className="input" value={legacyCode} onChange={(event) => setLegacyCode(event.target.value)} />
          </div>
          <div>
            <label className="form-label">Momento alquiler</label>
            <select className="input" value={rentPaymentTiming} onChange={(event) => {
              const value = event.target.value;
              setRentPaymentTiming(value);
              if (createFirstRentCharge) setFirstRentDueDate(suggestedFirstRentDueDate(startDate, firstRentPeriod, value));
            }}>
              <option value="adelantado">Adelantado</option>
              <option value="vencido">Vencido</option>
            </select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="form-label">Propiedad</label>
            <select className="input" value={propertyId} onChange={(event) => setPropertyId(event.target.value)} required>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.reference} · {property.address}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Inquilino</label>
            <select className="input" value={tenantId} onChange={(event) => {
              const next = event.target.value;
              setTenantId(next);
              setTenantIds((current) => current.filter((id) => id !== next));
            }} required>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="form-label">Titulares adicionales</label>
          <div className="max-h-32 space-y-1 overflow-auto rounded-md border border-slate-200 bg-white p-3 text-sm">
            {tenants
              .filter((tenant) => String(tenant.id) !== tenantId)
              .map((tenant) => (
                <label key={tenant.id} className="flex items-center gap-2 text-slate-700">
                  <input
                    type="checkbox"
                    checked={tenantIds.includes(String(tenant.id))}
                    onChange={(event) => {
                      const value = String(tenant.id);
                      setTenantIds((current) => {
                        if (event.target.checked) {
                          return current.includes(value) ? current : [...current, value];
                        }
                        return current.filter((id) => id !== value);
                      });
                    }}
                  />
                  <span>{tenant.full_name}</span>
                </label>
              ))}
            {!tenants.filter((tenant) => String(tenant.id) !== tenantId).length && (
              <p className="text-muted">No hay otros inquilinos cargados.</p>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">
            Se usan para pagos y avisos; el titular principal es el del selector de arriba.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="form-label">Inicio</label>
            <input className="input" type="date" value={startDate} onChange={(event) => {
              const value = event.target.value;
              setStartDate(value);
              if (!firstRentPeriod) setFirstRentPeriod(value.slice(0, 7));
            }} />
          </div>
          <div>
            <label className="form-label">Fin contractual</label>
            <input className="input" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            <p className="mt-1 text-xs text-muted">Fecha real del contrato firmado.</p>
          </div>
          <div>
            <label className="form-label">Cobrar/generar hasta</label>
            <input className="input" type="date" value={billingEndDate} onChange={(event) => setBillingEndDate(event.target.value)} />
            <p className="mt-1 text-xs text-muted">Si queda vacío, usa el fin contractual.</p>
          </div>
          <div>
            <label className="form-label">Alquiler</label>
            <input className="input" type="number" min="1" value={rentAmount} onChange={(event) => setRentAmount(event.target.value)} required />
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <label className="flex items-start gap-2 text-sm font-semibold text-slate-700">
            <input
              className="mt-1"
              type="checkbox"
              checked={createFirstRentCharge}
              onChange={(event) => {
                setCreateFirstRentCharge(event.target.checked);
                if (event.target.checked && !firstRentAmount) setFirstRentAmount("");
                if (event.target.checked && !firstRentDueDate) setFirstRentDueDate(firstRentSuggestedDueDate);
              }}
            />
            <span>
              Generar primer alquiler / cuota inicial
              <span className="mt-1 block font-normal text-muted">
                Usalo para prorrateos o importes manuales al firmar. Se crea una deuda `ALQUILER` y luego comisiones, IVA e IRPF se calculan en la liquidación normal.
              </span>
            </span>
          </label>
          {createFirstRentCharge && (
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div>
                <label className="form-label">Mes/año que corresponde</label>
                <input className="input" type="month" value={firstRentPeriod} onChange={(event) => {
                  const value = event.target.value;
                  setFirstRentPeriod(value);
                  setFirstRentDueDate(suggestedFirstRentDueDate(startDate, value, rentPaymentTiming));
                }} />
              </div>
              <div>
                <label className="form-label">Importe primer alquiler</label>
                <input className="input" type="number" min="0" step="0.01" value={firstRentAmount} onChange={(event) => setFirstRentAmount(event.target.value)} placeholder="Importe manual" />
              </div>
              <div>
                <label className="form-label">Fecha de vencimiento</label>
                <input className="input" type="date" value={firstRentDueDate || firstRentSuggestedDueDate} onChange={(event) => setFirstRentDueDate(event.target.value)} />
                <p className="mt-1 text-xs text-muted">
                  {rentPaymentTiming === "vencido"
                    ? "Mes vencido: vence el día 10 del mes siguiente."
                    : "Mes adelantado: queda para abonar enseguida."}
                </p>
              </div>
            </div>
          )}
          {firstRentError && <p className="mt-3 rounded-md bg-amber-50 p-2 text-sm font-semibold text-amber-800">{firstRentError}</p>}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="form-label">Tipo pago</label>
            <select className="input" value={paymentType} onChange={(event) => setPaymentType(event.target.value)}>
              <option value="adelantado">Adelantado</option>
              <option value="vencido">Vencido</option>
            </select>
          </div>
          <div>
            <label className="form-label">Garantía</label>
            <select className="input" value={guaranteeType} onChange={(event) => {
              const value = event.target.value;
              setGuaranteeType(value);
              if (value === "anda") {
                setGuaranteePercent("2");
                setPaymentOrigin("ANDA");
              } else if (value === "contaduria") {
                setGuaranteePercent("3");
                setPaymentOrigin("Contaduria");
              }
            }}>
              <option value="sin_garantia">Sin garantía</option>
              <option value="anda">ANDA</option>
              <option value="contaduria">Contaduría</option>
              <option value="aseguradora">Aseguradora privada</option>
              <option value="luc">LUC</option>
              <option value="fianza_personal">Fianza personal</option>
              <option value="otro">Otra</option>
            </select>
          </div>
          <div>
            <label className="form-label">Proveedor garantía</label>
            <input className="input" value={guaranteeProvider} onChange={(event) => setGuaranteeProvider(event.target.value)} placeholder="Mapfre, Porto, Sura..." />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="form-label">Garantía %</label>
            <input className="input" type="number" step="0.1" value={guaranteePercent} onChange={(event) => setGuaranteePercent(event.target.value)} />
          </div>
          <div>
            <label className="form-label">Régimen alquiler</label>
            <select className="input" value={rentRegime} onChange={(event) => {
              const value = event.target.value;
              setRentRegime(value);
              setReajustmentIndex(value === "regimen_legal" ? "indice_reajuste_alquileres" : "libre");
            }}>
              <option value="libre_contratacion">Libre contratación</option>
              <option value="regimen_legal">Régimen legal</option>
            </select>
          </div>
          <div>
            <label className="form-label">Próximo reajuste</label>
            <input className="input" type="date" value={nextReajustmentDate} onChange={(event) => setNextReajustmentDate(event.target.value)} />
          </div>
        </div>
	        <div className="grid gap-3 sm:grid-cols-3">
	          <div>
	            <label className="form-label">Índice reajuste</label>
	            <select className="input" value={reajustmentIndex} onChange={(event) => setReajustmentIndex(event.target.value)}>
              <option value="libre">Libre / manual</option>
              <option value="indice_reajuste_alquileres">Índice reajuste alquileres</option>
            </select>
          </div>
          <div>
            <label className="form-label">Comisión administración %</label>
            <input className="input" type="number" step="0.1" value={commissionPercent} onChange={(event) => setCommissionPercent(event.target.value)} />
          </div>
	          <div>
	            <label className="form-label">Origen</label>
	            <select className="input" value={paymentOrigin} onChange={(event) => setPaymentOrigin(event.target.value)}>
	              <option value="normal">Normal</option>
	              <option value="ANDA">ANDA</option>
	              <option value="Contaduria">Contaduría</option>
	              <option value="CEDE">CEDE</option>
		            </select>
		          </div>
		        </div>
	        <div className="grid gap-3 sm:grid-cols-3">
	          <label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm font-semibold text-slate-700">
	            <input type="checkbox" checked={commissionOnRent} onChange={(event) => setCommissionOnRent(event.target.checked)} />
	            Comisión por alquiler
	          </label>
	          <label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm font-semibold text-slate-700">
	            <input type="checkbox" checked={commissionOnOtherCharges} onChange={(event) => setCommissionOnOtherCharges(event.target.checked)} />
	            Comisión por otros débitos
	          </label>
	          <label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm font-semibold text-slate-700">
	            <input type="checkbox" checked={commissionIvaApplies} onChange={(event) => setCommissionIvaApplies(event.target.checked)} />
	            IVA sobre comisión
	          </label>
	        </div>
		        <div className="grid gap-3 sm:grid-cols-2">
		          <div>
		            <label className="form-label">Tipo fiscal inquilino</label>
	            <select className="input" value={tenantTaxRole} onChange={(event) => {
	              const value = event.target.value;
	              setTenantTaxRole(value);
	              if (value === "cede") {
	                setPaymentOrigin("CEDE");
	                setResguardoRequired(true);
	              }
	            }}>
	              <option value="normal">Normal</option>
	              <option value="cede">CEDE / agente de retención</option>
	            </select>
	          </div>
	          <label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm font-semibold text-slate-700">
	            <input type="checkbox" checked={resguardoRequired} onChange={(event) => setResguardoRequired(event.target.checked)} />
	            Requiere control de resguardo
	          </label>
	        </div>
	        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={irpfApplies} onChange={(event) => setIrpfApplies(event.target.checked)} />
            Aplica IRPF
          </label>
          <div>
            <label className="form-label">IRPF %</label>
            <input className="input" type="number" step="0.1" value={irpfPercent} onChange={(event) => setIrpfPercent(event.target.value)} disabled={!irpfApplies} />
          </div>
        </div>
        <label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          Contrato activo
        </label>
        <button className="btn-primary w-full justify-center" disabled={loading || !propertyId || !tenantId || Boolean(firstRentError)}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : contract ? <Edit3 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {contract ? "Actualizar contrato" : "Guardar contrato"}
        </button>
      </form>
    </Modal>
  );
}

function ReajustmentModal({
  contract,
  onClose,
  onApplied
}: {
  contract: ContractItem;
  onClose: () => void;
  onApplied: () => Promise<void>;
}) {
  const [atDate, setAtDate] = useState(contract.next_reajustment_date || todayIso());
  const [factorOverride, setFactorOverride] = useState("");
  const [preview, setPreview] = useState<ContractReajustmentPreview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  async function calculate() {
    setLoading(true);
    setError("");
    try {
      const payload: Record<string, unknown> = { at_date: atDate || null };
      const factor = Number(factorOverride);
      if (factorOverride.trim() && Number.isFinite(factor)) {
        payload.factor_override = factor;
      }
      const result = await api.previewContractReajustment(contract.id, payload);
      setPreview(result);
    } catch (error) {
      setPreview(null);
      setError(error instanceof Error ? error.message : "No se pudo calcular el reajuste");
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    if (!preview) return;
    setApplying(true);
    setError("");
    try {
      const payload: Record<string, unknown> = { at_date: atDate, update_next_reajustment_date: true };
      const factor = Number(factorOverride);
      if (factorOverride.trim() && Number.isFinite(factor)) {
        payload.factor_override = factor;
      }
      await api.applyContractReajustment(contract.id, payload);
      await onApplied();
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo aplicar el reajuste");
    } finally {
      setApplying(false);
    }
  }

  async function scheduleAlert() {
    setScheduling(true);
    setError("");
    try {
      await api.updateContract(contract.id, {
        legacy_code: contract.legacy_code,
        property_id: contract.property_id,
        tenant_id: contract.tenant_id,
        tenant_ids: (contract.tenants ?? []).map((tenant) => tenant.id),
        start_date: contract.start_date,
        end_date: contract.end_date,
        billing_end_date: contract.billing_end_date,
        rent_amount: contract.rent_amount,
        payment_type: contract.payment_type,
        rent_payment_timing: contract.rent_payment_timing,
        guarantee_type: contract.guarantee_type,
        guarantee_provider: contract.guarantee_provider,
        guarantee_percent: contract.guarantee_percent,
        rent_regime: contract.rent_regime,
        reajustment_index: contract.reajustment_index,
        next_reajustment_date: atDate,
        commission_percent: contract.commission_percent,
        commission_on_rent: contract.commission_on_rent,
        commission_on_other_charges: contract.commission_on_other_charges,
        commission_iva_applies: contract.commission_iva_applies,
        irpf_applies: contract.irpf_applies,
        irpf_percent: contract.irpf_percent,
        payment_origin: contract.payment_origin,
        tenant_tax_role: contract.tenant_tax_role,
        resguardo_required: contract.resguardo_required,
        active: contract.active
      });
      await onApplied();
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo guardar la fecha de reajuste");
    } finally {
      setScheduling(false);
    }
  }

  useEffect(() => {
    calculate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
	    <Modal title="Reajuste de alquiler" onClose={onClose}>
	      <div className="space-y-4">
	        <div className="rounded-md bg-slate-50 p-3 text-sm">
	          <p className="font-semibold text-ink">{contract.tenant_name}</p>
	          <p className="text-muted">{contract.property_reference} · {contract.property_address}</p>
	        </div>
	        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="form-label">Fecha de reajuste</label>
            <input className="input" type="date" value={atDate} onChange={(event) => setAtDate(event.target.value)} />
          </div>
          <div>
            <label className="form-label">Factor (opcional)</label>
            <input className="input" value={factorOverride} onChange={(event) => setFactorOverride(event.target.value)} placeholder="Ej: 1.0316" />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <button className="btn-secondary justify-center" onClick={calculate} disabled={loading || !atDate}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Calcular reajuste
          </button>
          <button className="btn-secondary justify-center" onClick={scheduleAlert} disabled={scheduling || !atDate}>
            {scheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            Guardar alerta
          </button>
        </div>
        {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {preview && (
	          <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
	            <div className="grid gap-3 sm:grid-cols-5">
	              <MiniStat label="Anterior" value={formatCurrency(preview.old_rent_amount)} />
	              <MiniStat label="Factor" value={String(preview.factor)} />
	              <MiniStat label="Variación" value={`${preview.percent}%`} />
	              <MiniStat label="Nuevo" value={formatCurrency(preview.new_rent_amount)} />
	              <MiniStat label="Mes índice" value={`${preview.index_period} · ${preview.rent_payment_timing}`} />
	            </div>
            <div className="rounded-md bg-slate-50 p-3 text-sm text-muted">
              <p className="whitespace-pre-wrap">{preview.message}</p>
              {preview.source_url && (
                <p className="mt-2 text-xs">
                  Fuente: <a className="text-brand underline" href={preview.source_url} target="_blank" rel="noreferrer">{preview.source_url}</a>
                </p>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <button className="btn-secondary justify-center" onClick={() => navigator.clipboard.writeText(preview.message)}>
                <Copy className="h-4 w-4" />
                Copiar aviso
              </button>
              <a className={`btn-secondary justify-center ${!preview.whatsapp_url ? "pointer-events-none opacity-50" : ""}`} href={preview.whatsapp_url || "#"} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
              <a className={`btn-secondary justify-center ${!preview.mailto_url ? "pointer-events-none opacity-50" : ""}`} href={preview.mailto_url || "#"} target="_blank" rel="noreferrer">
                <Send className="h-4 w-4" />
                Email
              </a>
            </div>
            <button className="btn-primary w-full justify-center" onClick={apply} disabled={applying || !atDate}>
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Aplicar reajuste (actualiza el alquiler)
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function TenantDetailModal({ person, onClose }: { person: Person; onClose: () => void }) {
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [credits, setCredits] = useState<TenantCredit[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reallocationPaymentId, setReallocationPaymentId] = useState<number | null>(null);

  async function loadDetail() {
    setLoading(true);
    try {
      const [detailData, creditsData, auditData] = await Promise.all([
        api.personDetail(person.id),
        api.tenantCredits({ person_id: String(person.id) }),
        api.auditLog({ entity_type: "payment" })
      ]);
      setDetail(detailData);
      setCredits(creditsData);
      setAudit(auditData);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo cargar la ficha");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDetail();
  }, [person.id]);

  async function voidPayment(paymentId: number) {
    const reason = window.prompt("Motivo de anulación", "Error de carga");
    if (!reason) return;
    await api.voidPayment(paymentId, reason);
    await loadDetail();
  }

  return (
    <>
    <Modal title="Ficha de inquilino" onClose={onClose}>
      {loading ? (
        <div className="flex justify-center p-6"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div>
      ) : error ? (
        <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
      ) : detail ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniStat label="Contacto" value={detail.person.mobile || detail.person.email || "Sin dato"} />
            <MiniStat label="Deuda total" value={formatCurrency(detail.person.total_debt)} />
            <MiniStat label="Abiertas" value={String(detail.person.open_charges)} />
          </div>
          <Panel title="Deudas del inquilino" action={<span className="text-sm text-muted">fecha, período, importe y saldo</span>}>
            {detail.charges.length ? (
              <div className="overflow-auto rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-muted">
                    <tr>
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Descripción</th>
                      <th className="px-3 py-2">Mes</th>
                      <th className="px-3 py-2">Pasa/estado</th>
                      <th className="px-3 py-2">Importe</th>
                      <th className="px-3 py-2">Saldo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {detail.charges.map((charge) => (
                      <tr key={charge.id}>
                        <td className="px-3 py-2">{charge.due_date}</td>
                        <td className="px-3 py-2">
                          <p className="font-semibold text-ink">{charge.concept}</p>
                          <p className="text-xs text-muted">{chargePropertyLabel(charge)}</p>
                          <p className="text-xs text-muted">{charge.description || "Sin descripción"}</p>
                        </td>
                        <td className="px-3 py-2">{chargePeriodLabel(charge)}</td>
                        <td className="px-3 py-2"><StatusBadge status={charge.status} /></td>
                        <td className="px-3 py-2">{formatCurrency(charge.amount)}</td>
                        <td className="px-3 py-2 font-semibold text-ink">{formatCurrency(charge.remaining_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted">Sin deudas.</p>
            )}
          </Panel>
          <Panel title="Pagos">
            <div className="divide-y divide-slate-100">
              {detail.payments.slice(0, 8).map((payment) => (
                <div key={payment.id} className="grid gap-3 py-2 text-sm sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-center">
                  <p className="text-muted">{payment.payment_date} · {payment.method} · {payment.reference || "sin referencia"} · {payment.status || "confirmado"}</p>
                  <p className="font-semibold text-emerald-700">{formatCurrency(payment.amount)}</p>
                  <button className="icon-action" title="Corregir imputación sin tocar caja" onClick={() => setReallocationPaymentId(payment.id)} disabled={payment.status === "anulado"}>
                    <RefreshCw className="h-4 w-4" />
                  </button>
                  <a className="icon-action" title="Descargar recibo PDF" href={exportUrl(`/payments/${payment.id}/receipt.pdf`)}>
                    <ArrowDownToLine className="h-4 w-4" />
                  </a>
                  <button className="icon-action" title="Anular pago" onClick={() => voidPayment(payment.id)} disabled={payment.status === "anulado"}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {!detail.payments.length && <p className="text-sm text-muted">Sin pagos registrados.</p>}
            </div>
          </Panel>
          <Panel title="Saldos a favor">
            <div className="divide-y divide-slate-100">
              {credits.map((credit) => (
                <div key={credit.id} className="flex justify-between py-2 text-sm">
                  <span className="text-muted">{credit.status} · {credit.notes}</span>
                  <span className="font-semibold text-emerald-700">{formatCurrency(credit.remaining_amount)}</span>
                </div>
              ))}
              {!credits.length && <p className="text-sm text-muted">Sin saldo a favor.</p>}
            </div>
          </Panel>
          <Panel title="Auditoría">
            <div className="space-y-2">
              {audit.slice(0, 6).map((item) => (
                <div key={item.id} className="rounded-md bg-slate-50 p-2 text-sm">
                  <p className="font-semibold text-ink">{item.action}</p>
                  <p className="text-muted">{item.created_at} · {item.description}</p>
                </div>
              ))}
              {!audit.length && <p className="text-sm text-muted">Sin auditoría registrada.</p>}
            </div>
          </Panel>
          <Panel title="Recordatorios">
            <div className="space-y-2">
              {detail.reminders.slice(0, 4).map((reminder) => (
                <div key={reminder.id} className="rounded-md bg-slate-50 p-3 text-sm">
                  <p className="font-semibold text-ink">{reminder.channel} · {reminder.status}</p>
                  <p className="mt-1 line-clamp-2 text-muted">{reminder.message}</p>
                </div>
              ))}
              {!detail.reminders.length && <p className="text-sm text-muted">Sin recordatorios.</p>}
            </div>
          </Panel>
        </div>
      ) : null}
    </Modal>
    {reallocationPaymentId && (
      <PaymentReallocationModal
        paymentId={reallocationPaymentId}
        onClose={() => setReallocationPaymentId(null)}
        onSaved={async () => {
          setReallocationPaymentId(null);
          await loadDetail();
        }}
      />
    )}
    </>
  );
}

function PaymentReallocationModal({
  paymentId,
  onClose,
  onSaved
}: {
  paymentId: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<PaymentDetail | null>(null);
  const [allocations, setAllocations] = useState<Record<number, string>>({});
  const [correctedAmount, setCorrectedAmount] = useState("");
  const [reason, setReason] = useState("Corrección de imputación operativa");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadPayment() {
    setLoading(true);
    setError("");
    try {
      const data = await api.paymentDetail(paymentId);
      setDetail(data);
      setCorrectedAmount(String(data.amount));
      setAllocations(
        Object.fromEntries(
          data.candidate_charges.map((charge) => [
            charge.id,
            charge.current_payment_amount > 0 ? String(charge.current_payment_amount) : ""
          ])
        ) as Record<number, string>
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo cargar la imputación");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPayment();
  }, [paymentId]);

  const currentAllocated = detail?.allocated_amount ?? 0;
  const correctedAmountNumber = Number(correctedAmount || 0);
  const newTotal = Object.values(allocations).reduce((sum, value) => sum + Number(value || 0), 0);
  const totalIsValid = correctedAmountNumber > 0 && newTotal <= correctedAmountNumber + 0.01;
  const cashDifference = detail ? correctedAmountNumber - detail.amount : 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!detail || !totalIsValid) return;
    setSaving(true);
    setError("");
    try {
      await api.reallocatePayment(detail.id, {
        reason,
        corrected_amount: correctedAmountNumber,
        allocations: detail.candidate_charges
          .map((charge) => ({ charge_id: charge.id, amount: Number(allocations[charge.id] || 0) }))
          .filter((item) => item.amount > 0)
      });
      await onSaved();
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo corregir la imputación");
    } finally {
      setSaving(false);
    }
  }

  function inputAmount(amount: number) {
    return amount > 0 ? String(Number(amount.toFixed(2))) : "";
  }

  function replaceAllocations(chargeId: number, amount: number) {
    if (!detail) return;
    setAllocations(
      Object.fromEntries(
        detail.candidate_charges.map((charge) => [charge.id, charge.id === chargeId ? inputAmount(amount) : ""])
      ) as Record<number, string>
    );
  }

  function moveRealAmountTo(chargeId: number) {
    replaceAllocations(chargeId, correctedAmountNumber || currentAllocated);
  }

  function payRemainingBalance(charge: PaymentDetail["candidate_charges"][number]) {
    const remainingBalance = Number(charge.available_for_payment.toFixed(2));
    setCorrectedAmount(inputAmount(remainingBalance));
    replaceAllocations(charge.id, remainingBalance);
  }

  return (
    <Modal title="Corregir imputación" onClose={onClose}>
      {loading ? (
        <div className="flex justify-center p-6"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div>
      ) : detail ? (
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-900">
            <p className="font-semibold">Caja queda trazable</p>
            <p>Si cambiás el monto real cobrado, el sistema crea un ajuste de caja solo por la diferencia.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <MiniStat label="Pagador" value={detail.person_name} />
            <MiniStat label="Registrado" value={formatCurrency(detail.amount)} />
            <MiniStat label="Imputado actual" value={formatCurrency(currentAllocated)} />
            <MiniStat label="Ajuste caja" value={formatCurrency(cashDifference)} />
          </div>
          <div>
            <label className="form-label">Monto real cobrado</label>
            <input className="input" type="number" min="1" value={correctedAmount} onChange={(event) => setCorrectedAmount(event.target.value)} />
            <p className="mt-1 text-xs text-muted">Ejemplo: si se cargó $1.500 de UTE pero eran $4.400 de gastos comunes, usá Pagar saldo en la deuda real.</p>
          </div>
          <div className="rounded-md bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-ink">Imputación actual</p>
            {detail.allocations.length ? (
              <div className="mt-2 space-y-1">
                {detail.allocations.map((allocation) => (
                  <p key={allocation.id} className="text-muted">
                    {allocation.charge?.concept || "Deuda"} · {allocation.charge?.period || "-"} · {allocation.charge?.property_reference || ""}: {formatCurrency(allocation.amount)}
                  </p>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-muted">Este pago no tiene imputaciones activas.</p>
            )}
          </div>
          <div>
            <label className="form-label">Motivo</label>
            <input className="input" value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
          <div className="overflow-hidden rounded-md border border-slate-100">
            <div className="hidden grid-cols-[1fr_auto_auto_220px] gap-3 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted md:grid">
              <span>Deuda destino</span>
              <span>Disponible</span>
              <span>Nuevo importe</span>
              <span>Acción</span>
            </div>
            <div className="divide-y divide-slate-100">
              {detail.candidate_charges.map((charge) => (
                <div key={charge.id} className="grid gap-2 px-3 py-3 text-sm md:grid-cols-[1fr_auto_130px_220px] md:items-center">
                  <div>
                    <p className="font-semibold text-ink">{charge.concept} · {charge.period}</p>
                    <p className="text-muted">{charge.property_reference} · {charge.description || "sin descripción"}</p>
                  </div>
                  <span className="font-medium text-ink">{formatCurrency(charge.available_for_payment)}</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    max={charge.available_for_payment}
                    value={allocations[charge.id] ?? ""}
                    onChange={(event) => setAllocations({ ...allocations, [charge.id]: event.target.value })}
                  />
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <button
                      className="btn-secondary justify-center"
                      type="button"
                      onClick={() => moveRealAmountTo(charge.id)}
                      disabled={charge.available_for_payment + 0.01 < (correctedAmountNumber || currentAllocated)}
                    >
                      Mover monto
                    </button>
                    <button
                      className="btn-secondary justify-center"
                      type="button"
                      onClick={() => payRemainingBalance(charge)}
                      disabled={charge.available_for_payment <= 0}
                    >
                      Pagar saldo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className={`rounded-md p-3 text-sm ${totalIsValid ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
            Nueva imputación: {formatCurrency(newTotal)} · Monto real: {formatCurrency(correctedAmountNumber)} · Saldo a favor: {formatCurrency(Math.max(correctedAmountNumber - newTotal, 0))}.
            {correctedAmountNumber - newTotal > 0.01 && (
              <p className="mt-1 font-medium">Atención: queda dinero sin imputar como saldo a favor. Si querés cerrar una deuda, usá Pagar saldo en esa deuda.</p>
            )}
          </div>
          {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          <button className="btn-primary w-full justify-center" disabled={saving || !totalIsValid || currentAllocated <= 0}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Guardar corrección y ajustar caja
          </button>
        </form>
      ) : (
        <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error || "No se pudo cargar la imputación"}</p>
      )}
    </Modal>
  );
}

function PropertyDetailModal({ property, onClose }: { property: PropertyItem; onClose: () => void }) {
  const [detail, setDetail] = useState<PropertyDetail | null>(null);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingOwners, setEditingOwners] = useState(false);
  const [ownerIrpf, setOwnerIrpf] = useState<Record<number, boolean>>({});
  const [ownerSaving, setOwnerSaving] = useState(false);
  const [ownerError, setOwnerError] = useState("");
  const [serviceType, setServiceType] = useState("UTE");
  const [provider, setProvider] = useState("UTE");
  const [accountNumber, setAccountNumber] = useState("");
  const [portalUrl, setPortalUrl] = useState("https://www.ute.com.uy/imprima-su-factura");
  const [referenceData, setReferenceData] = useState("");
  const [payer, setPayer] = useState("tenant");
  const [serviceNotes, setServiceNotes] = useState("");

  async function loadDetail() {
    setLoading(true);
    try {
      const [detailData, auditData] = await Promise.all([
        api.propertyDetail(property.id),
        api.auditLog({ entity_type: "property_service" })
      ]);
      setDetail(detailData);
      setAudit(auditData);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDetail();
  }, [property.id]);

  useEffect(() => {
    if (!detail) return;
    setOwnerIrpf(
      Object.fromEntries(
        detail.property.owners.map((owner) => [owner.id, owner.irpf_applies !== false]) as Array<[number, boolean]>
      )
    );
    setOwnerError("");
    setEditingOwners(false);
  }, [detail?.property?.id]);

  async function saveOwnerIrpf() {
    if (!detail) return;
    setOwnerSaving(true);
    setOwnerError("");
    try {
      await api.updateProperty(detail.property.id, {
        legacy_code: detail.property.legacy_code,
        reference: detail.property.reference,
        address: detail.property.address,
        door_number: detail.property.door_number,
        unit_number: detail.property.unit_number,
        padron: detail.property.padron,
        occupancy_status: detail.property.occupancy_status,
        property_type: detail.property.property_type,
        destination: detail.property.destination,
        ute_account: detail.property.ute_account,
        ose_account: detail.property.ose_account,
        taxes_account: detail.property.taxes_account,
        sanitation_account: detail.property.sanitation_account,
        notes: detail.property.notes,
        owner_shares: detail.property.owners.map((owner, index) => ({
          owner_id: owner.id,
          percentage: owner.percentage,
          is_primary: owner.is_primary ?? index === 0,
          irpf_applies: ownerIrpf[owner.id] !== false
        }))
      });
      await loadDetail();
    } catch (error) {
      setOwnerError(error instanceof Error ? error.message : "No se pudo guardar IRPF");
    } finally {
      setOwnerSaving(false);
    }
  }

  async function addService(event: FormEvent) {
    event.preventDefault();
    if (!accountNumber) return;
    await api.createPropertyService(property.id, {
	      service_type: serviceType,
	      provider: provider || serviceType,
	      account_number: accountNumber,
	      portal_url: portalUrl,
	      reference_data: referenceData,
	      payer,
      active: true,
      notes: serviceNotes
    });
	    setAccountNumber("");
	    setReferenceData("");
	    setServiceNotes("");
    await loadDetail();
  }

  async function removeService(serviceId: number) {
    if (!window.confirm("Eliminar esta cuenta de servicio?")) return;
    await api.deletePropertyService(property.id, serviceId);
    await loadDetail();
  }

  async function uploadFile(file: File) {
    await api.uploadAttachment("property", property.id, file);
    await loadDetail();
  }

  return (
    <Modal title="Ficha de finca" onClose={onClose}>
      {loading ? (
        <div className="flex justify-center p-6"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div>
      ) : detail ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniStat label="Referencia" value={detail.property.reference} />
            <MiniStat label="Estado" value={detail.property.occupancy_status} />
            <MiniStat label="Padrón" value={detail.property.padron || "Sin dato"} />
            <MiniStat label="Puerta / unidad" value={[detail.property.door_number, detail.property.unit_number].filter(Boolean).join(" · ") || "Sin dato"} />
          </div>
          <Panel
            title="Propietarios"
            action={
              editingOwners ? (
                <div className="flex gap-2">
                  <button className="btn-secondary" onClick={() => setEditingOwners(false)} disabled={ownerSaving}>
                    Cancelar
                  </button>
                  <button className="btn-primary" onClick={saveOwnerIrpf} disabled={ownerSaving}>
                    {ownerSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Guardar IRPF
                  </button>
                </div>
              ) : (
                <button className="btn-secondary" onClick={() => setEditingOwners(true)} disabled={!detail.property.owners.length}>
                  <Edit3 className="h-4 w-4" />
                  Editar IRPF
                </button>
              )
            }
          >
            <div className="divide-y divide-slate-100">
              {detail.property.owners.map((owner) => (
                <div key={owner.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                  <span className="font-medium text-ink">{owner.full_name} <span className="font-normal text-muted">· {owner.percentage}%</span></span>
                  {editingOwners ? (
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={ownerIrpf[owner.id] !== false}
                        onChange={(event) => setOwnerIrpf((current) => ({ ...current, [owner.id]: event.target.checked }))}
                      />
                      IRPF aplica
                    </label>
                  ) : (
                    <span className="text-muted">{owner.percentage}% · IRPF {owner.irpf_applies === false ? "no" : "sí"}</span>
                  )}
                </div>
              ))}
            </div>
            {ownerError && <p className="mt-3 rounded-md bg-rose-50 p-2 text-sm text-rose-700">{ownerError}</p>}
          </Panel>
          <Panel title="Cuentas de servicios">
            <div className="mb-3 rounded-md bg-blue-50 p-3 text-sm text-blue-900">
              Para asociar facturas automaticas, cargá acá la cuenta o referencia que aparece en el correo. Para gastos comunes usá la referencia de pago, por ejemplo 000113000271.
            </div>
	            <form onSubmit={addService} className="mb-3 grid gap-2 lg:grid-cols-[1fr_1fr_1.4fr_1fr_1fr_auto]">
	              <select className="input" value={serviceType} onChange={(event) => {
	                const nextType = event.target.value;
	                setServiceType(nextType);
	                setProvider(nextType === "GASTOS_COMUNES" ? "Administración" : nextType);
	                setPortalUrl(defaultServicePortal(nextType));
	              }}>
                <option value="UTE">UTE</option>
                <option value="OSE">OSE</option>
                <option value="GASTOS_COMUNES">Gastos comunes</option>
                <option value="TRIBUTOS">Tributos</option>
	                <option value="SANEAMIENTO">Saneamiento</option>
	                <option value="PRIMARIA">Primaria</option>
	                <option value="CONTRIBUCION">Contribución</option>
	              </select>
	              <input className="input" value={provider} onChange={(event) => setProvider(event.target.value)} placeholder="Proveedor" />
	              <input className="input" value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} placeholder="Cuenta o referencia" />
              <select className="input" value={payer} onChange={(event) => setPayer(event.target.value)}>
                <option value="tenant">Inquilino</option>
                <option value="owner">Propietario</option>
                <option value="agency">Inmobiliaria</option>
              </select>
	              <input className="input" value={serviceNotes} onChange={(event) => setServiceNotes(event.target.value)} placeholder="Notas/unidad" />
	              <button className="btn-secondary justify-center">
                <Plus className="h-4 w-4" />
                Agregar
              </button>
	            </form>
	            <div className="mb-3 grid gap-2 md:grid-cols-2">
	              <input className="input" value={portalUrl} onChange={(event) => setPortalUrl(event.target.value)} placeholder="URL para descargar factura" />
	              <input className="input" value={referenceData} onChange={(event) => setReferenceData(event.target.value)} placeholder="Datos necesarios: CI, padrón, cuenta, unidad..." />
	            </div>
	            <div className="divide-y divide-slate-100">
	              {detail.services.map((service) => (
	                <div key={service.id} className="grid gap-2 py-2 text-sm md:grid-cols-[1fr_1fr_1.4fr_1fr_auto_auto] md:items-center">
                  <span className="font-medium text-ink">{service.service_type}</span>
                  <span className="text-muted">{service.provider || "-"}</span>
	                  <span className="text-muted">{service.account_number}</span>
	                  <span className="text-muted">{service.payer === "tenant" ? "Inquilino" : service.payer === "owner" ? "Propietario" : "Inmobiliaria"}</span>
	                  <span className={`rounded-md px-2 py-1 text-xs font-semibold ${service.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{service.active ? "Activo" : "Inactivo"}</span>
	                  <div className="flex gap-2">
	                    {service.portal_url && (
	                      <a className="icon-action" title="Abrir portal" href={service.portal_url} target="_blank" rel="noreferrer">
	                        <LinkIcon className="h-4 w-4" />
	                      </a>
	                    )}
	                    <button className="icon-action" title="Eliminar cuenta" onClick={() => removeService(service.id)}>
	                      <Trash2 className="h-4 w-4" />
	                    </button>
	                  </div>
	                  {service.reference_data && <p className="text-xs text-muted md:col-span-6">Datos descarga: {service.reference_data}</p>}
	                </div>
              ))}
              {!detail.services.length && <p className="py-2 text-sm text-muted">Sin cuentas de servicio cargadas.</p>}
            </div>
          </Panel>
          <Panel title="Contratos y deuda">
            <div className="space-y-2">
              <p className="text-sm text-muted">{detail.contracts.length} contrato(s) · {detail.charges.length} deuda(s)</p>
              {detail.charges.slice(0, 6).map((charge) => (
                <div key={charge.id} className="flex justify-between rounded-md bg-slate-50 p-2 text-sm">
                  <span>{charge.tenant_name} · {charge.concept} · {charge.period}</span>
                  <span className="font-semibold">{formatCurrency(charge.remaining_amount)}</span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Comprobantes y documentos">
            <label className="btn-secondary mb-3 cursor-pointer">
              <FileImage className="h-4 w-4" />
              Adjuntar archivo
              <input
                className="hidden"
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) uploadFile(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <div className="divide-y divide-slate-100">
              {detail.attachments.map((attachment) => (
                <div key={attachment.id} className="flex justify-between py-2 text-sm">
                  <span className="font-medium text-ink">{attachment.filename}</span>
                  <span className="text-muted">{attachment.uploaded_at}</span>
                </div>
              ))}
              {!detail.attachments.length && <p className="text-sm text-muted">Sin adjuntos.</p>}
            </div>
          </Panel>
          <Panel title="Auditoría">
            <div className="space-y-2">
              {audit.slice(0, 6).map((item) => (
                <div key={item.id} className="rounded-md bg-slate-50 p-2 text-sm">
                  <p className="font-semibold text-ink">{item.action}</p>
                  <p className="text-muted">{item.created_at} · {item.description}</p>
                </div>
              ))}
              {!audit.length && <p className="text-sm text-muted">Sin auditoría registrada.</p>}
            </div>
          </Panel>
        </div>
      ) : null}
    </Modal>
  );
}

function FreePaymentModal({
  person,
  defaultMethod,
  onClose,
  onSaved
}: {
  person: Person;
  defaultMethod: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [method, setMethod] = useState(defaultMethod || "transferencia");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("Pago recibido sin deuda imputada");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!amount || Number(amount) <= 0) return;
    setLoading(true);
    setError("");
    try {
      await api.createPayment({
        person_id: person.id,
        amount: Number(amount),
        payment_date: paymentDate,
        method,
        reference,
        notes,
        allocations: []
      });
      await onSaved();
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo registrar el pago");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Nuevo pago" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-md bg-slate-50 p-3">
          <p className="font-semibold text-ink">{person.full_name}</p>
          <p className="text-sm text-muted">Si no se imputa a una deuda, queda como saldo a favor y entra en caja.</p>
        </div>
        {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="form-label">Monto</label>
            <input className="input" type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} required />
          </div>
          <div>
            <label className="form-label">Fecha</label>
            <input className="input" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="form-label">Método</label>
            <select className="input" value={method} onChange={(event) => setMethod(event.target.value)}>
              <option value="transferencia">Transferencia</option>
              <option value="efectivo">Efectivo</option>
              <option value="redpagos">Redpagos</option>
              <option value="ANDA">ANDA</option>
	                    <option value="Contaduria">Contaduría</option>
            </select>
          </div>
          <div>
            <label className="form-label">Referencia</label>
            <input className="input" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Comprobante" />
          </div>
        </div>
        <div>
          <label className="form-label">Notas</label>
          <textarea className="input min-h-20" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </div>
        <button className="btn-primary w-full justify-center" disabled={loading || Number(amount) <= 0}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
          Registrar pago
        </button>
      </form>
    </Modal>
  );
}

function TenantCreditModal({
  tenants,
  onClose,
  onSaved
}: {
  tenants: Person[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [tenantId, setTenantId] = useState(String(tenants[0]?.id ?? ""));
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [method, setMethod] = useState("transferencia");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("Crédito / saldo a favor cargado desde Deudas");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selectedTenant = tenants.find((tenant) => String(tenant.id) === tenantId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedTenant || Number(amount) <= 0) return;
    setLoading(true);
    setError("");
    try {
      await api.createPayment({
        person_id: selectedTenant.id,
        amount: Number(amount),
        payment_date: paymentDate,
        method,
        reference,
        notes,
        allocations: []
      });
      await onSaved();
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo crear el crédito");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Nuevo crédito inquilino" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
          Esto crea un saldo a favor del inquilino y una entrada de caja, porque representa dinero recibido sin imputar todavía a una deuda.
        </div>
        {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <div>
          <label className="form-label">Inquilino</label>
          <select className="input" value={tenantId} onChange={(event) => setTenantId(event.target.value)} required>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>{personDisplayLabel(tenant)}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="form-label">Monto</label>
            <input className="input" type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} required />
          </div>
          <div>
            <label className="form-label">Fecha</label>
            <input className="input" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
          </div>
          <div>
            <label className="form-label">Método</label>
            <select className="input" value={method} onChange={(event) => setMethod(event.target.value)}>
              <option value="transferencia">Transferencia</option>
              <option value="efectivo">Efectivo</option>
              <option value="redpagos">Redpagos</option>
              <option value="ANDA">ANDA</option>
              <option value="Contaduria">Contaduría</option>
            </select>
          </div>
        </div>
        <div>
          <label className="form-label">Referencia</label>
          <input className="input" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Comprobante, recibo o nota" />
        </div>
        <div>
          <label className="form-label">Notas</label>
          <textarea className="input min-h-20" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </div>
        <button className="btn-primary w-full justify-center" disabled={loading || Number(amount) <= 0}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          Crear crédito inquilino
        </button>
      </form>
    </Modal>
  );
}

function OwnerCreditModal({
  owners,
  properties,
  onClose,
  onSaved
}: {
  owners: Person[];
  properties: PropertyItem[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [ownerId, setOwnerId] = useState(String(owners[0]?.id ?? ""));
  const [propertyId, setPropertyId] = useState(String(properties[0]?.id ?? ""));
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState(currentPeriod());
  const [creditDate, setCreditDate] = useState(todayIso());
  const [description, setDescription] = useState("Crédito a favor del propietario");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const filteredProperties = properties.filter((property) => !ownerId || property.owners.some((owner) => String(owner.id) === ownerId));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ownerId || !propertyId || Number(amount) <= 0) return;
    setLoading(true);
    setError("");
    try {
      await api.createOwnerCharge({
        owner_id: Number(ownerId),
        property_id: Number(propertyId),
        concept: "CREDITO",
        description,
        amount: -Math.abs(Number(amount)),
        charge_date: creditDate,
        period,
        paid_by_agency: false,
        generates_commission: false,
        commission_percent: 0,
        split_by_ownership: false,
        allow_duplicate: true
      });
      await onSaved();
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo crear el crédito");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Nuevo crédito propietario" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-800">
          Esto suma un ajuste positivo en la liquidación del propietario. No genera salida de caja al cargarlo; impacta cuando se liquida/paga al propietario.
        </div>
        {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="form-label">Propietario</label>
            <select className="input" value={ownerId} onChange={(event) => setOwnerId(event.target.value)} required>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>{personDisplayLabel(owner)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Finca</label>
            <select className="input" value={propertyId} onChange={(event) => setPropertyId(event.target.value)} required>
              {(filteredProperties.length ? filteredProperties : properties).map((property) => (
                <option key={property.id} value={property.id}>{propertyOptionLabel(property)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="form-label">Monto crédito</label>
            <input className="input" type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} required />
          </div>
          <div>
            <label className="form-label">Fecha</label>
            <input className="input" type="date" value={creditDate} onChange={(event) => setCreditDate(event.target.value)} />
          </div>
          <div>
            <label className="form-label">Período liquidación</label>
            <input className="input" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
          </div>
        </div>
        <div>
          <label className="form-label">Descripción</label>
          <textarea className="input min-h-20" value={description} onChange={(event) => setDescription(event.target.value)} />
        </div>
        <button className="btn-primary w-full justify-center" disabled={loading || Number(amount) <= 0}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          Crear crédito propietario
        </button>
      </form>
    </Modal>
  );
}

function InstitutionalReconciliationModal({
  institution,
  onClose
}: {
  institution: "anda" | "contaduria";
  onClose: () => void;
}) {
  const [period, setPeriod] = useState(currentPeriod());
	  const [data, setData] = useState<InstitutionalReconciliation | null>(null);
	  const [liquidatedAmounts, setLiquidatedAmounts] = useState<Record<number, string>>({});
	  const [loading, setLoading] = useState(false);
	  const [importing, setImporting] = useState(false);
	  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
	    try {
	      const result = await api.institutionalReconciliation(institution, period);
	      setData(result);
	      setLiquidatedAmounts(Object.fromEntries(result.rows.map((row) => [row.contract_id, String(row.imported_amount ?? row.expected_net)])));
	    } catch (error) {
	      setError(error instanceof Error ? error.message : "No se pudo cargar la conciliación");
	    } finally {
	      setLoading(false);
	    }
	  }

	  async function importFile(file: File) {
	    setImporting(true);
	    setError("");
	    try {
	      const result = await api.importInstitutionalReconciliation(institution, period, file);
	      setData(result);
	      setLiquidatedAmounts(Object.fromEntries(result.rows.map((row) => [row.contract_id, String(row.imported_amount ?? row.expected_net)])));
	    } catch (error) {
	      setError(error instanceof Error ? error.message : "No se pudo importar la liquidación");
	    } finally {
	      setImporting(false);
	    }
	  }

  useEffect(() => {
    load();
  }, [institution, period]);

  const totalExpected = data?.rows.reduce((sum, row) => sum + row.expected_net, 0) ?? 0;
  const totalLiquidated = data?.rows.reduce((sum, row) => sum + Number(liquidatedAmounts[row.contract_id] || 0), 0) ?? 0;

  return (
    <Modal title={`Conciliación ${institution === "anda" ? "ANDA" : "Contaduría"}`} onClose={onClose} size="wide">
      <div className="space-y-4">
	        <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-800">
	          Esta pantalla trae contratos por garantía/origen {institution === "anda" ? "ANDA" : "Contaduría"} y calcula esperado, comisiones, IVA, IRPF/exoneración y diferencias contra lo liquidado. Podés cargar un CSV, TXT, PDF o XLSX recibido por correo/SIGGA para comparar automáticamente.
	        </div>
	        {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
	        <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
          <div>
            <label className="form-label">Período</label>
            <input className="input" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniStat label="Esperado neto" value={formatCurrency(totalExpected)} />
            <MiniStat label="Liquidado cargado" value={formatCurrency(totalLiquidated)} />
            <MiniStat label="Diferencia" value={formatCurrency(totalLiquidated - totalExpected)} />
          </div>
	          <button className="btn-secondary" onClick={load} disabled={loading}>
	            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
	            Actualizar
	          </button>
	        </div>
	        <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[1fr_auto] lg:items-center">
	          <div>
	            <p className="font-semibold text-ink">Importar liquidación externa</p>
	            <p className="text-sm text-muted">Acepta columnas como contrato, inquilino, finca, importe/liquidado/neto. Si viene en PDF o texto, intenta leer cada línea y matchear por código.</p>
	          </div>
	          <label className="btn-secondary cursor-pointer justify-center">
	            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
	            Subir archivo
	            <input
	              className="hidden"
	              type="file"
	              accept=".csv,.txt,.pdf,.xlsx,text/csv,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	              onChange={(event) => {
	                const file = event.target.files?.[0];
	                if (file) importFile(file);
	                event.currentTarget.value = "";
	              }}
	            />
	          </label>
	        </div>
	        {data?.import_summary && (
	          <div className="grid gap-3 sm:grid-cols-5">
	            <MiniStat label="Filas detectadas" value={String(data.import_summary.rows_detected)} />
	            <MiniStat label="Matcheadas" value={String(data.import_summary.matched)} />
	            <MiniStat label="Diferencias" value={String(data.import_summary.differences)} />
	            <MiniStat label="Sin importe" value={String(data.import_summary.missing)} />
	            <MiniStat label="No matcheadas" value={String(data.import_summary.unmatched)} />
	          </div>
	        )}
	        {(data?.import_summary?.warnings ?? []).length > 0 && (
	          <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
	            {(data?.import_summary?.warnings ?? []).map((warning, index) => <p key={`${warning}-${index}`}>{warning}</p>)}
	          </div>
	        )}
	        {data?.rows.length ? (
	          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
	            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
	              <div>
	                <p className="font-semibold text-ink">Detalle de contratos conciliados</p>
	                <p className="text-xs text-muted">Deslizá horizontalmente para ver comisiones, IRPF, liquidado real y diferencia.</p>
	              </div>
	              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
	                {data.rows.length} contrato(s)
	              </span>
	            </div>
	            <div className="max-h-[62vh] overflow-auto">
	              <table className="min-w-[1180px] divide-y divide-slate-200 text-sm">
	                <thead className="sticky top-0 z-10 bg-slate-100 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
	                  <tr>
	                    <th className="w-72 px-4 py-3">Contrato</th>
	                    <th className="w-64 px-4 py-3">Finca</th>
	                    <th className="px-4 py-3 text-right">Bruto</th>
	                    <th className="px-4 py-3 text-right">Com. inst.</th>
	                    <th className="px-4 py-3 text-right">IVA inst.</th>
	                    <th className="px-4 py-3 text-right">Adm. + IVA</th>
	                    <th className="px-4 py-3 text-right">IRPF</th>
	                    <th className="px-4 py-3 text-right">Esperado</th>
	                    <th className="w-40 px-4 py-3 text-right">Liquidado real</th>
	                    <th className="w-36 px-4 py-3 text-right">Diferencia</th>
	                  </tr>
	                </thead>
	                <tbody className="divide-y divide-slate-100 bg-white">
	                  {data.rows.map((row) => {
	                    const liquidated = Number(liquidatedAmounts[row.contract_id] || 0);
	                    const difference = liquidated - row.expected_net;
	                    const hasDifference = Math.abs(difference) > 0.01;
	                    const hasImport = row.imported_amount !== undefined && row.imported_amount !== null;
	                    return (
	                      <tr key={row.contract_id} className="align-top transition hover:bg-slate-50/80">
	                        <td className="px-4 py-3">
	                          <p className="font-semibold text-ink">Inq {row.tenant_legacy_code || "s/n"} - {row.tenant_name}</p>
	                          <p className="mt-1 text-xs text-muted">Contrato {row.contract_code || row.contract_id}</p>
	                          <p className="mt-1 text-xs text-muted">Prop {row.owner_names.join(", ") || "sin propietario"}</p>
	                        </td>
	                        <td className="px-4 py-3 text-muted">
	                          <p className="font-medium text-slate-700">Fin {row.property_reference || "s/n"}</p>
	                          <p className="mt-1 text-xs leading-5">{row.property_address || "Sin dirección"}</p>
	                        </td>
	                        <td className="px-4 py-3 text-right font-medium text-ink">{formatCurrency(row.gross_rent)}</td>
	                        <td className="px-4 py-3 text-right">
	                          <p className="font-medium text-ink">{formatCurrency(row.institution_commission)}</p>
	                          <p className="text-xs text-muted">{row.institution_commission_percent}% institucional</p>
	                        </td>
	                        <td className="px-4 py-3 text-right">{formatCurrency(row.institution_iva)}</td>
	                        <td className="px-4 py-3 text-right">
	                          <p className="font-medium text-ink">{formatCurrency(row.admin_commission)}</p>
	                          <p className="text-xs text-muted">IVA {formatCurrency(row.admin_iva)}</p>
	                        </td>
	                        <td className="px-4 py-3 text-right">
	                          {row.irpf_exonerated ? (
	                            <span className="inline-flex rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Exonerado</span>
	                          ) : (
	                            <span>{formatCurrency(row.irpf_retained)}</span>
	                          )}
	                        </td>
	                        <td className="px-4 py-3 text-right font-semibold text-ink">{formatCurrency(row.expected_net)}</td>
	                        <td className="px-4 py-3 text-right">
	                          <input
	                            className="input min-w-32 text-right"
	                            type="number"
	                            value={liquidatedAmounts[row.contract_id] ?? ""}
	                            onChange={(event) => setLiquidatedAmounts((current) => ({ ...current, [row.contract_id]: event.target.value }))}
	                          />
	                          {hasImport && <p className="mt-1 text-xs text-muted">Importado</p>}
	                        </td>
	                        <td className="px-4 py-3 text-right">
	                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${hasDifference ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
	                            {formatCurrency(difference)}
	                          </span>
	                          {row.match_status === "sin_importe" && <p className="mt-1 text-xs text-muted">Sin match</p>}
	                          {row.imported_source_line && <p className="mt-1 max-w-52 truncate text-xs font-normal text-muted" title={row.imported_source_line}>{row.imported_source_line}</p>}
	                        </td>
	                      </tr>
	                    );
	                  })}
	                </tbody>
	              </table>
	            </div>
	          </div>
	        ) : (
	          <EmptyState title="Sin contratos para conciliar" detail="No hay contratos activos con esa garantía/origen para el período seleccionado." />
	        )}
	        {(data?.unmatched_imports ?? []).length > 0 && (
	          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
	            <p className="font-semibold text-amber-950">Filas importadas sin match</p>
	            <div className="mt-2 space-y-1 text-sm text-amber-900">
	              {(data?.unmatched_imports ?? []).slice(0, 8).map((row, index) => (
	                <p key={`${row.source_line}-${index}`}>
	                  {formatCurrency(row.amount)} · {row.source_line || [row.contract_code, row.tenant_legacy_code, row.property_reference, row.tenant_name].filter(Boolean).join(" · ")}
	                </p>
	              ))}
	            </div>
	          </div>
	        )}
	      </div>
	    </Modal>
  );
}

function OwnerChargeModal({
  owners,
  properties,
  ownerCharges,
  onClose,
  onSaved
}: {
  owners: Person[];
  properties: PropertyItem[];
  ownerCharges: OwnerCharge[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [ownerId, setOwnerId] = useState(String(owners[0]?.id ?? ""));
  const [propertyId, setPropertyId] = useState(String(properties[0]?.id ?? ""));
  const [propertyQuery, setPropertyQuery] = useState("");
  const [concept, setConcept] = useState("CONTRIBUCION");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [chargeDate, setChargeDate] = useState(todayIso());
  const [period, setPeriod] = useState(currentPeriod());
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [paidByAgency, setPaidByAgency] = useState(false);
  const [generatesCommission, setGeneratesCommission] = useState(false);
  const [splitByOwnership, setSplitByOwnership] = useState(false);
  const [commissionPercent, setCommissionPercent] = useState("3");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selectedProperty = properties.find((property) => String(property.id) === propertyId);
  const selectedPropertyShares = selectedProperty?.owners ?? [];
  const amountNumber = Number(amount || 0);
  const splitPreview = selectedPropertyShares.map((owner) => ({
    ...owner,
    calculatedAmount: amountNumber * (owner.percentage / 100)
  }));
  const ownershipPercentageTotal = selectedPropertyShares.reduce((total, owner) => total + Number(owner.percentage || 0), 0);
  const filteredProperties = properties.filter((property) => {
    const ownerMatches = !ownerId || property.owners.some((owner) => String(owner.id) === ownerId);
    const text = `${property.reference} ${property.address} ${property.door_number} ${property.unit_number} ${property.padron}`;
    return ownerMatches && (!propertyQuery || includesText(text, propertyQuery));
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ownerId || !propertyId) return;
    const duplicate = ownerCharges.find((item) => {
      if (item.status === "anulado") return false;
      return String(item.owner_id) === ownerId && String(item.property_id) === propertyId && item.concept === concept && (item.period || "") === (period || "");
    });
    if (duplicate && !window.confirm(`Ya existe un débito de ${concept} para ${selectedProperty?.reference || "esta finca"} en ${period || "sin periodo"}. ¿Querés cargar otro igual?`)) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const payload = {
        owner_id: Number(ownerId),
        property_id: Number(propertyId),
        concept,
        description,
        amount: Number(amount),
        charge_date: chargeDate,
        period,
        period_from: periodFrom || null,
        period_to: periodTo || null,
        paid_by_agency: paidByAgency,
        generates_commission: generatesCommission,
        commission_percent: Number(commissionPercent || 0),
        split_by_ownership: splitByOwnership,
        allow_duplicate: Boolean(duplicate)
      };
      try {
        await api.createOwnerCharge(payload);
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo guardar";
        if (message.toLowerCase().includes("posible duplicado") && window.confirm(`${message}\n\n¿Querés guardar igual?`)) {
          await api.createOwnerCharge({ ...payload, allow_duplicate: true });
        } else {
          throw error;
        }
      }
      await onSaved();
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo guardar el débito");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Nuevo débito a propietario" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="form-label">Propietario</label>
            <select className="input" value={ownerId} onChange={(event) => setOwnerId(event.target.value)} required>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>{personOptionLabel(owner)}</option>
              ))}
            </select>
	          </div>
	          <div>
	            <label className="form-label">Finca / Propiedad</label>
	            <input className="input mb-2" value={propertyQuery} onChange={(event) => setPropertyQuery(event.target.value)} placeholder="Buscar por dirección, apto, padrón..." />
	            <select className="input" value={propertyId} onChange={(event) => setPropertyId(event.target.value)} required>
	              {(filteredProperties.length ? filteredProperties : properties).map((property) => (
	                <option key={property.id} value={property.id}>{propertyOptionLabel(property)}</option>
	              ))}
	            </select>
	          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="form-label">Concepto</label>
            <select className="input" value={concept} onChange={(event) => setConcept(event.target.value)}>
              {ownerConcepts.map((item) => <option key={item} value={item}>{item.replace("_", " ")}</option>)}
            </select>
            {concept === "OTROS" && <p className="mt-1 text-xs text-muted">Usá la descripción para escribir el detalle exacto del gasto.</p>}
          </div>
          <div>
            <label className="form-label">Monto</label>
            <input className="input" type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} required />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="form-label">Fecha</label>
            <input className="input" type="date" value={chargeDate} onChange={(event) => setChargeDate(event.target.value)} />
          </div>
          <div>
            <label className="form-label">Periodo liquidación</label>
            <input className="input" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="form-label">Periodo desde</label>
            <input className="input" type="date" value={periodFrom} onChange={(event) => setPeriodFrom(event.target.value)} />
          </div>
          <div>
            <label className="form-label">Periodo hasta</label>
            <input className="input" type="date" value={periodTo} onChange={(event) => setPeriodTo(event.target.value)} />
          </div>
        </div>
        <textarea className="input min-h-20" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Detalle del gasto o comprobante" />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={paidByAgency} onChange={(event) => setPaidByAgency(event.target.checked)} />
            La inmobiliaria pagó este gasto
          </label>
          <label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={generatesCommission} onChange={(event) => setGeneratesCommission(event.target.checked)} />
            Cobra comisión
          </label>
          <label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm font-semibold text-slate-700 sm:col-span-2">
            <input type="checkbox" checked={splitByOwnership} onChange={(event) => setSplitByOwnership(event.target.checked)} />
            Repartir entre propietarios según porcentaje
          </label>
          {splitByOwnership && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm sm:col-span-2">
              <p className="font-semibold text-emerald-950">Se crearán débitos separados para cada propietario de la finca.</p>
              {splitPreview.length ? (
                <div className="mt-2 space-y-1">
                  {splitPreview.map((owner) => (
                    <p key={owner.id} className="text-emerald-900">
                      {owner.full_name}: {owner.percentage}% · {formatCurrency(owner.calculatedAmount)}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-emerald-900">Esta finca no tiene porcentajes cargados; se usará el propietario seleccionado al 100%.</p>
              )}
              {splitPreview.length > 0 && Math.abs(ownershipPercentageTotal - 100) > 0.01 && (
                <p className="mt-2 text-amber-700">Revisá la finca: los porcentajes cargados suman {ownershipPercentageTotal}%.</p>
              )}
            </div>
          )}
        </div>
        <p className="rounded-md bg-blue-50 p-3 text-xs text-blue-800">
          Si marcás que la inmobiliaria lo pagó, se crea una salida real de Caja. Si no lo marcás, queda solo como descuento en la liquidación del propietario.
        </p>
        {generatesCommission && (
          <div>
            <label className="form-label">Comisión %</label>
            <input className="input" type="number" step="0.1" value={commissionPercent} onChange={(event) => setCommissionPercent(event.target.value)} />
          </div>
        )}
        <button className="btn-primary w-full justify-center" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Guardar débito y caja
        </button>
      </form>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
  size = "normal"
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: "normal" | "wide";
}) {
  const maxWidth = size === "wide" ? "max-w-7xl" : "max-w-5xl";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className={`max-h-[92vh] w-full ${maxWidth} overflow-y-auto rounded-lg bg-white shadow-panel`}>
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <h3 className="font-semibold text-ink">{title}</h3>
          <button className="icon-btn" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export default App;
