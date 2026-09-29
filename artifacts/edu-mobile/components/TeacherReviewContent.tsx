import React from "react";
import { Text, View } from "react-native";

import { HtmlText } from "@/components/HtmlText";
import { useColors } from "@/hooks/useColors";

export interface TeacherReviewItem {
  groupName?: string | null;
  subCriteriaName?: string | null;
  comment?: string | null;
  inputType?: string | null;
  checked?: boolean | null;
}

export interface TeacherReviewCriteria {
  criteriaName?: string | null;
  rating?: number | null;
  items?: TeacherReviewItem[];
}

export interface TeacherReviewBlock {
  teacherName?: string | null;
  criteria?: TeacherReviewCriteria[];
}

function hasRenderableItem(item: TeacherReviewItem): boolean {
  const inputType = (item.inputType ?? "").trim().toLowerCase();
  if (inputType === "checkbox") {
    return Boolean(
      item.subCriteriaName?.trim() ||
      item.groupName?.trim() ||
      typeof item.checked === "boolean" ||
      item.comment?.trim(),
    );
  }
  return Boolean(item.subCriteriaName?.trim() || item.comment?.trim());
}

function hasRenderableCriteria(criteria: TeacherReviewCriteria): boolean {
  const hasRating = typeof criteria.rating === "number" && criteria.rating > 0;
  return hasRating || (criteria.items ?? []).some(hasRenderableItem);
}

export function hasPublishedTeacherReview(reviewData?: TeacherReviewBlock[] | null): boolean {
  return (reviewData ?? []).some((block) =>
    (block.criteria ?? []).some(hasRenderableCriteria),
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Text key={star} style={{ fontSize: 13, color: star <= rating ? "#f59e0b" : "#d1d5db" }}>
          ★
        </Text>
      ))}
    </View>
  );
}

function ReviewItems({
  items,
}: {
  items: TeacherReviewItem[];
}) {
  const groups: Array<{ name: string; items: TeacherReviewItem[] }> = [];

  for (const item of items.filter(hasRenderableItem)) {
    const name = item.groupName?.trim() ?? "";
    const existing = groups.find((group) => group.name === name);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.push({ name, items: [item] });
    }
  }

  return (
    <View style={{ gap: 8 }}>
      {groups.map((group, groupIndex) => (
        <View key={`${group.name || "ungrouped"}-${groupIndex}`} style={{ gap: 5 }}>
          {group.name ? (
            <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#9a701f", textTransform: "uppercase", letterSpacing: 0.5 }}>
              {group.name}
            </Text>
          ) : null}
          {group.items.map((item, itemIndex) => {
            const isCheckbox = (item.inputType ?? "").trim().toLowerCase() === "checkbox";
            const hasCheckedValue = typeof item.checked === "boolean";

            return (
              <View
                key={`${item.subCriteriaName || "item"}-${itemIndex}`}
                style={{ backgroundColor: "#fff", borderRadius: 8, padding: 10 }}
              >
                {isCheckbox ? (
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <Text style={{ flex: 1, fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#374151", lineHeight: 18 }}>
                      {item.subCriteriaName || "Tiêu chí"}
                    </Text>
                    {hasCheckedValue ? (
                      <View style={{
                        backgroundColor: item.checked ? "#dcfce7" : "#fee2e2",
                        borderRadius: 10,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                      }}>
                        <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: item.checked ? "#166534" : "#991b1b" }}>
                          {item.checked ? "Đạt" : "Chưa đạt"}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : item.subCriteriaName ? (
                  <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#b45309", marginBottom: item.comment?.trim() ? 4 : 0 }}>
                    {item.subCriteriaName}
                  </Text>
                ) : null}
                {item.comment?.trim() ? (
                  <HtmlText html={item.comment ?? ""} style={{ fontSize: 13, color: "#374151", lineHeight: 19 }} compactImages />
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function TeacherReviewContent({
  reviewData,
  colors,
  emptyText = "Chưa có nội dung nhận xét",
}: {
  reviewData: TeacherReviewBlock[];
  colors: ReturnType<typeof useColors>;
  emptyText?: string;
}) {
  const blocks = (reviewData ?? []).filter((block) =>
    (block.criteria ?? []).some(hasRenderableCriteria),
  );

  if (blocks.length === 0) {
    return (
      <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", paddingVertical: 40 }}>
        {emptyText}
      </Text>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {blocks.map((block, blockIndex) => (
        <View
          key={`${block.teacherName || "teacher"}-${blockIndex}`}
          style={{ backgroundColor: "#fffbeb", borderRadius: 12, padding: 12, borderLeftWidth: 3, borderLeftColor: "#f59e0b" }}
        >
          {block.teacherName ? (
            <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#f59e0b", marginBottom: 8 }}>
              {block.teacherName}
            </Text>
          ) : null}
          <View style={{ gap: 12 }}>
            {(block.criteria ?? [])
              .filter(hasRenderableCriteria)
              .map((criteria, criteriaIndex) => {
                const rating = typeof criteria.rating === "number" ? Math.min(5, Math.max(0, criteria.rating)) : 0;
                return (
                  <View key={`${criteria.criteriaName || "criteria"}-${criteriaIndex}`} style={{ gap: 7 }}>
                    {criteria.criteriaName || rating > 0 ? (
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        {criteria.criteriaName ? (
                          <Text style={{ flex: 1, fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#92400e", textTransform: "uppercase", letterSpacing: 0.5 }}>
                            {criteria.criteriaName}
                          </Text>
                        ) : <View style={{ flex: 1 }} />}
                        {rating > 0 ? <Stars rating={rating} /> : null}
                      </View>
                    ) : null}
                    <ReviewItems items={criteria.items ?? []} />
                  </View>
                );
              })}
          </View>
        </View>
      ))}
    </View>
  );
}