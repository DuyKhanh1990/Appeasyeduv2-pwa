import common from "./common";
import calendar from "./calendar";
import assignments from "./assignments";
import grades from "./grades";
import invoices from "./invoices";
import payroll from "./payroll";
import requests from "./requests";
import home from "./home";
import social from "./social";
import tasks from "./tasks";
import operations from "./operations";
import profile from "./profile";
import shared from "./shared";
import fileviewer from "./fileviewer";
import editors from "./editors";
import exam from "./exam";
import learning from "./learning";

const english: Record<string, string> = {
  ...common,
  ...calendar,
  ...assignments,
  ...grades,
  ...invoices,
  ...payroll,
  ...requests,
  ...home,
  ...social,
  ...tasks,
  ...operations,
  ...profile,
  ...shared,
  ...fileviewer,
  ...editors,
  ...exam,
  ...learning,
};

export function translate(sourceText: string): string {
  return english[sourceText] ?? sourceText;
}