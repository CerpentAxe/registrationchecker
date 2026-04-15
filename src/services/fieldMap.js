const FIELD_LABELS = {
  country: "Country",
  applicationNumber: "Application No.",
  registrationNumber: "Registration No.",
  trademark: "Trade Mark",
  classes: "Classes",
  specification: "Goods / Services",
  applicant: "Applicant",
  applicantAddress: "Applicant Address",
  endorsement: "Endorsement",
  association: "Associated with",
  disclaimer: "Disclaimer",
  admission: "Admission",
  applicationDate: "Application Date",
  registrationDate: "Registration Date",
};

const MANUAL_CHECK_FIELDS = [
  "applicantAddress",
  "endorsement",
  "association",
  "disclaimer",
  "admission",
];

function normalizeKey(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const EXCEL_KEY_MAP = {
  country: "country",
  applicationno: "applicationNumber",
  applicationnumber: "applicationNumber",
  registrationno: "registrationNumber",
  registrationnumber: "registrationNumber",
  trademark: "trademark",
  classes: "classes",
  class: "classes",
  goodsservices: "specification",
  goodsorservices: "specification",
  specification: "specification",
  applicant: "applicant",
  applicantaddress: "applicantAddress",
  applicationdate: "applicationDate",
  registrationdate: "registrationDate",
  addressforservicename: "addressForServiceName",
  addressforserviceaddress: "addressForServiceAddress",
  endorsement: "endorsement",
  associatedwith: "association",
  association: "association",
  disclaimer: "disclaimer",
  admission: "admission",
};

module.exports = {
  FIELD_LABELS,
  MANUAL_CHECK_FIELDS,
  EXCEL_KEY_MAP,
  normalizeKey,
};
