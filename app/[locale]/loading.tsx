"use client";

import Lottie from "lottie-react";
import carAnimation from "@/assets/Car.json";

const LoadingPage = () => {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        width: "100vw",
      }}
    >
      <Lottie
        animationData={carAnimation}
        loop
        style={{ width: 120, height: 120 }}
      />
    </div>
  );
};

export default LoadingPage;
