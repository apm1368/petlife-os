import type { Meta, StoryObj } from "@storybook/react";
import { Check, Package } from "lucide-react";
import { BarChart } from "./Chart";
import { ComponentStateView } from "./ComponentState";
import { DataTable } from "./DataTable";
import { ObjectCard } from "./ObjectCard";
import { PrimaryActionBar } from "./PrimaryActionBar";
import { StatusLabel } from "./StatusLabel";
import { Input } from "./Input";
import { InlineConfirmation, TypedConfirmation } from "./Confirmation";

const meta = { title: "Design system/coverage", tags: ["autodocs"] } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function Coverage() {
  return <div className="mx-auto grid max-w-4xl gap-6">
    <ObjectCard image={<span className="flex size-14 items-center justify-center"><Package /></span>} title="محصول نمونه" meta="کد کالا · ۳ موجود" status={<StatusLabel tone="success">فعال</StatusLabel>} action={<span className="text-cta text-brand-natural">مشاهده</span>} />
    <Input label="نام محصول" hint="نامی که مشتری می‌بیند" successMessage="ذخیره شد" defaultValue="غذای خشک" />
    <DataTable caption="سفارش‌ها" columns={[{ id: "id", header: "شماره", cell: (row: { id: string }) => row.id }, { id: "state", header: "وضعیت", cell: () => <StatusLabel tone="attention">در انتظار</StatusLabel> }]} rows={[{ id: "#ORD-1024" }]} getRowKey={(row) => row.id} />
    <BarChart title="فروش هفتگی" points={[{ label: "ش", value: 20 }, { label: "ی", value: 50 }, { label: "د", value: 34 }]} valueLabel={(value) => value.toLocaleString("fa-IR")} />
    <InlineConfirmation title="تأیید تغییر" description="این تغییر قابل بازگشت است." confirmLabel="تأیید" cancelLabel="انصراف" onConfirm={() => undefined} onCancel={() => undefined} />
    <TypedConfirmation title="حذف مورد" description="برای ادامه عبارت زیر را وارد کنید." confirmationText="حذف" confirmLabel="حذف" onConfirm={() => undefined} />
    <ComponentStateView state="no-access"><span /></ComponentStateView>
    <PrimaryActionBar label="ادامه" onClick={() => undefined} secondaryAction={<span className="text-cta text-text-secondary">ذخیره بعداً</span>} />
  </div>;
}

/** All production components are rendered in the required language/theme matrix below. */
export const FaLight: Story = { render: () => <Coverage />, globals: { locale: "fa", theme: "light" } };
export const FaDark: Story = { render: () => <Coverage />, globals: { locale: "fa", theme: "dark" } };
export const EnLight: Story = { render: () => <Coverage />, globals: { locale: "en", theme: "light" } };
export const EnDark: Story = { render: () => <Coverage />, globals: { locale: "en", theme: "dark" } };
export const ArLight: Story = { render: () => <Coverage />, globals: { locale: "ar", theme: "light" } };
export const ArDark: Story = { render: () => <Coverage />, globals: { locale: "ar", theme: "dark" } };
