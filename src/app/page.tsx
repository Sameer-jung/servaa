"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LandingNavbar } from "@/components/Landing/LandingNavbar";
import { HeroSection } from "@/components/Landing/HeroSection";
import { FeaturesSection } from "@/components/Landing/FeaturesSection";
import { WhyChooseUsSection } from "@/components/Landing/WhyChooseUsSection";
import { BusinessTypesSection } from "@/components/Landing/BusinessTypesSection";
import { PricingSection } from "@/components/Landing/PricingSection";
import { ContactSection } from "@/components/Landing/ContactSection";
import { LandingFooter } from "@/components/Landing/LandingFooter";

export default function HomePage() {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<
    "register" | "login" | null
  >(null);

  const goToRegister = () => {
    if (loadingAction) return;
    setLoadingAction("register");
    router.push("/register");
  };

  const goToLogin = () => {
    if (loadingAction) return;
    setLoadingAction("login");
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <LandingNavbar
        loadingAction={loadingAction}
        onStartTrial={goToRegister}
        onSignIn={goToLogin}
      />

      <HeroSection
        loadingAction={loadingAction}
        onGetStarted={goToRegister}
        onSignIn={goToLogin}
      />

      <FeaturesSection />
      <WhyChooseUsSection />
      <BusinessTypesSection />
      <PricingSection onChoosePlan={goToRegister} />
      <ContactSection />
      <LandingFooter />
    </div>
  );
}
