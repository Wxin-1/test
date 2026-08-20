// export对外开放，别的文件才能导入
export async function fetchAiAnswer(query: string, ctx: any) {
    // 现在是模拟假返回，以后替换成真实后端接口
    return `模拟AI回答：
用户问题：${query}
读取到编辑器文件名：${ctx.fileName}
读取代码片段：
${ctx.code?.slice(0,300)}`;
}