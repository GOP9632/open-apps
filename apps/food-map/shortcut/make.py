# 產生「收進美食收藏」分享捷徑（未簽章）：python3 make.py
import plistlib, uuid
T, D = str(uuid.uuid4()).upper(), str(uuid.uuid4()).upper()
O = "￼"
def tok(att): return {"Value": {"string": O, "attachmentsByRange": {"{0, 1}": att}}, "WFSerializationType": "WFTextTokenString"}
def txt(s): return {"Value": {"string": s}, "WFSerializationType": "WFTextTokenString"}
def item(k, v): return {"WFItemType": 0, "WFKey": txt(k), "WFValue": v}
actions = [
  {"WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
   "WFWorkflowActionParameters": {"UUID": T, "WFTextActionText": ""}},
  {"WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
   "WFWorkflowActionParameters": {"UUID": D, "WFURL": "https://ptocokzxpwwautnbbuup.supabase.co/functions/v1/quick-add",
     "WFHTTPMethod": "POST", "WFHTTPBodyType": "JSON",
     "WFJSONValues": {"Value": {"WFDictionaryFieldValueItems": [
        item("key", tok({"OutputUUID": T, "Type": "ActionOutput", "OutputName": "Text"})),
        item("input", tok({"Type": "ExtensionInput"})),
     ]}, "WFSerializationType": "WFDictionaryFieldValue"}}},
  {"WFWorkflowActionIdentifier": "is.workflow.actions.notification",
   "WFWorkflowActionParameters": {"WFNotificationActionTitle": "美食收藏", "WFNotificationActionSound": True,
     "WFNotificationActionBody": tok({"OutputUUID": D, "Type": "ActionOutput", "OutputName": "Contents of URL"})}},
]
wf = {"WFWorkflowClientVersion": "2605.0.5", "WFWorkflowMinimumClientVersion": 900, "WFWorkflowMinimumClientVersionString": "900",
  "WFWorkflowIcon": {"WFWorkflowIconStartColor": 4282601983, "WFWorkflowIconGlyphNumber": 59511},
  "WFWorkflowImportQuestions": [{"ActionIndex": 0, "Category": "Parameter", "DefaultValue": "", "ParameterKey": "WFTextActionText",
     "Text": "貼上你的收藏碼（在美食收藏按「加入分享捷徑」時已經拷貝好了，長按選貼上）"}],
  "WFWorkflowTypes": ["ActionExtension"], "WFWorkflowHasShortcutInputVariables": True,
  "WFWorkflowInputContentItemClasses": ["WFURLContentItem", "WFStringContentItem", "WFSafariWebPageContentItem"],
  "WFWorkflowHasOutputFallback": False, "WFWorkflowOutputContentItemClasses": [], "WFQuickActionSurfaces": [],
  "WFWorkflowActions": actions}
with open("收進美食收藏-未簽章.shortcut", "wb") as f: plistlib.dump(wf, f, fmt=plistlib.FMT_BINARY)
