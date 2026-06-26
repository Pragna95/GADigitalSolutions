import { Card, CardContent } from "@/components/ui/card";
import { X } from "lucide-react";

export default function AISummaryCard({ closeCard }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
      <Card
        className="
          w-[566px]
          h-[276px]

          rounded-[12px]

          border
          border-blue-500

          bg-white

          pt-[21px]
          pr-[16px]
          pb-[21px]
          pl-[16px]

          shadow-2xl

          flex
          flex-col

          gap-[10px]
        "
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-2 -ml-2 -mt-3">
          <div className="p-3 rounded-full">
            <img
              src="/mic-icon.svg"
              alt="Mic"
              className="w-[24px] h-[24px]"
            />
          </div>

          <h1 className="text-[14px] font-semibold text-[#0046BB] -ml-3">
            AI Summary
          </h1>

          {/* Close Button */}
          <button
            onClick={closeCard}
            className="
              ml-auto
              w-[24px]
              h-[24px]

              border-2
              rounded-[5px]

              hover:bg-gray-100

              flex
              items-center
              justify-center
            "
          >
            <X className="w-[16px] h-[16px]" />
          </button>
        </div>

        {/* Content */}
        <CardContent
          className="
            flex-1
            overflow-y-auto

            p-0
            pr-2
          "
        >
          <p className="text-[14px] font-normal leading-relaxed text-[#000000]">
            In a recent meeting, our team discussed the upcoming summer project
            initiatives. We aim to enhance our product offerings and improve
            user engagement through innovative features. Key topics included the
            integration of AI tools to streamline workflows and enhance customer
            experiences. Each department shared their goals, emphasizing
            collaboration and creativity. We also reviewed feedback from
            previous projects to identify areas for improvement. The team is
            excited about the potential for growth and innovation this summer.
            Action items were assigned, with deadlines set to ensure progress.
            Overall, the meeting fostered a sense of enthusiasm and commitment
            to achieving our objectives. We look forward to implementing these
            ideas and making a significant impact in the coming months.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}