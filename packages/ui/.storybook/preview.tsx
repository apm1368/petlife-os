import type { Preview } from "@storybook/react";
import "../src/styles.css";

const preview: Preview = {
  parameters: { layout: "padded", backgrounds: { disable: true } },
  decorators: [(Story, context) => {
    const locale = String(context.globals.locale ?? "fa");
    const theme = String(context.globals.theme ?? "light");
    const dir = locale === "en" ? "ltr" : "rtl";
    return <div lang={locale} dir={dir} data-theme={theme} className="min-h-screen bg-surface-page p-4"><Story /></div>;
  }],
  globalTypes: {
    locale: { description: "Interface locale", defaultValue: "fa", toolbar: { items: ["fa", "en", "ar"] } },
    theme: { description: "Color theme", defaultValue: "light", toolbar: { items: ["light", "dark"] } },
  },
};

export default preview;
