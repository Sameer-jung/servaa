const faqs = [
  {
    question: "What is Servaa?",
    answer:
      "Servaa is a restaurant management system that combines QR menu ordering, live order tracking, table management, billing, and inventory & expense tracking into one dashboard for restaurants, cafes, and cloud kitchens.",
  },
  {
    question: "How does QR ordering work for restaurants?",
    answer:
      "Each table gets its own QR code. Customers scan it, browse your digital menu, and place orders directly from their phone — no app download or account needed. Orders land instantly in your restaurant dashboard.",
  },
  {
    question: "Can I manage inventory and expenses with Servaa?",
    answer:
      "Yes. Servaa includes a stock ledger for purchases, usage, and wastage with low-stock alerts, plus expense tracking so owners can see revenue minus costs at a glance.",
  },
  {
    question: "Does Servaa work for cafes, food courts, and cloud kitchens?",
    answer:
      "Yes. Servaa is built for restaurants, cafes, cloud kitchens, food courts, and hotels — anywhere table or counter ordering needs to be faster and easier to manage.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "Yes. The Demo plan gives you 15 days free with QR menu setup, table QR codes, and a basic order dashboard so you can try Servaa with your own menu before subscribing.",
  },
  {
    question: "Do my customers need to download an app to order?",
    answer:
      "No. Customers just scan the table QR code in their phone's camera and order from the browser. There is nothing to install for the customer or for your staff.",
  },
];

const faqStructuredData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
};

export function FAQSection() {
  return (
    <section id="faq" className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />

      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-bold uppercase tracking-wide text-brand-600">
          FAQ
        </p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
          Common questions about Servaa
        </h2>
      </div>

      <div className="mt-10 space-y-3">
        {faqs.map((faq) => (
          <details
            key={faq.question}
            className="group rounded-2xl border border-gray-200 bg-white px-5 py-4 open:border-brand-300 open:bg-brand-50/30"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-gray-950">
              {faq.question}
              <span className="shrink-0 text-brand-600 transition group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              {faq.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
