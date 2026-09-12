"use client";

import React from "react";
import { CheckCircle } from "lucide-react";

export function Toast({ message }: { message: string }) {
  return (
    <div className="fixed top-20 right-8 z-50 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg shadow-xl text-xs font-semibold flex items-center gap-2">
      <CheckCircle className="h-4 w-4 text-emerald-400" />
      {message}
    </div>
  );
}
