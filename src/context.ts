import * as vscode from "vscode";

// export 就是对外开放
export function getCurrentEditorContext() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return { fileName: null, code: null };
    }
    const fileName = editor.document.fileName;
    const code = editor.document.getText();
    return {
        fileName,
        code
    };
}