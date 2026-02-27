import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface GeminiConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
}

const createClient = (config: GeminiConfig) => {
  return new GoogleGenAI({ 
    apiKey: config.apiKey, 
    // @ts-ignore - baseUrl might not be in the type definition depending on version, but usually supported in transport or root
    baseUrl: config.baseUrl 
  });
};

export async function getAvailableModels(apiKey: string, baseUrl?: string): Promise<string[]> {
  try {
    const ai = new GoogleGenAI({ apiKey, baseUrl });
    const response = await ai.models.list();
    // The SDK returns a paginated list or async iterable. 
    // We need to iterate it.
    const models: string[] = [];
    // @ts-ignore
    for await (const model of response) {
      if (model.name) {
        // Strip 'models/' prefix if present for cleaner display, 
        // but keep it if the SDK expects it. The SDK usually handles both.
        // Let's keep the full name to be safe, or just the ID.
        models.push(model.name.replace('models/', ''));
      }
    }
    return models;
  } catch (error) {
    console.error("Failed to list models:", error);
    return [];
  }
}

export interface GeoGebraGenerationResult {
  commands: string[];
  perspective: string;
  problemDescription: string;
}

export async function generateGeoGebraCommands(
  problemText: string, 
  imageBase64: string | undefined, 
  mimeType: string = "image/jpeg",
  config: GeminiConfig
): Promise<GeoGebraGenerationResult> {
  const ai = createClient(config);
  
  let systemPrompt = `
    **角色设定**  
    你是一位精通 GeoGebra 平面几何和立体几何构造的专家。
      
    **任务要求**  
    用户会提供几何题或配图描述。你必须分析题目，提取题目描述，判断题目类型（2D/3D），并生成 GeoGebra 指令。

    **输出格式**
    请直接输出一个标准的 JSON 对象，不要包含 Markdown 格式标记（如 \`\`\`json ... \`\`\`）。JSON 结构如下：
    {
      "problemDescription": "这里是提取或优化的题目文本描述，如果用户提供了图片，请详细描述图片中的几何图形、已知条件和求解目标。",
      "perspective": "2", // "1": 代数/函数, "2": 平面几何, "5": 立体几何
      "commands": [
        "A = (0, 0)",
        "B = (2, 0)",
        "Segment(A, B)"
      ]
    }

    **GeoGebra 指令生成规则**  
    1. **只输出命令**：每条指令必须是合法的 GeoGebra 英文命令。
    2. **几何构造**：
        - **平面几何（2D）**：使用 (x, y) 坐标。常用：Point, Segment, Circle, Polygon 等。
        - **立体几何（3D）**：使用 (x, y, z) 坐标。常用：Point(x,y,z), Plane, Sphere, Polygon3D 等。
    3. **标签与显示**：
        - 使用 ShowLabel 控制标签。
        - 使用 ShowAxes(false) 和 ShowGrid(false) 隐藏坐标轴和网格（除非题目需要）。
    4. **准确性**：指令必须能复现题目图形。
  `;

  const parts: any[] = [{ text: problemText }];

  if (imageBase64) {
    parts.push({
      inlineData: {
        mimeType: mimeType,
        data: imageBase64
      }
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: config.model,
      contents: { parts },
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json"
      }
    });

    const text = response.text || "{}";
    const result = JSON.parse(text);
    
    return {
      commands: Array.isArray(result.commands) ? result.commands : [],
      perspective: result.perspective || "2",
      problemDescription: result.problemDescription || problemText || "未提供题目描述"
    };
  } catch (error) {
    console.error("Error generating GeoGebra commands:", error);
    // Fallback if JSON parsing fails or other error
    return {
      commands: [],
      perspective: "2",
      problemDescription: problemText || "解析失败，请重试。"
    };
  }
}

export async function modifyGeoGebraCommands(
  fullScript: string[],
  selectedScript: string,
  userInstruction: string,
  config: GeminiConfig
): Promise<string[]> {
  const ai = createClient(config);
  
  const systemPrompt = `
    **Role**
    You are a GeoGebra expert.
    
    **Task**
    Modify the selected GeoGebra commands based on the user's instruction.
    Ensure the new commands are valid and fit within the context of the full script.
    
    **Output Format**
    Return ONLY a JSON object:
    {
      "newCommands": ["cmd1", "cmd2", ...]
    }
    
    **Rules**
    1. Only output valid GeoGebra commands.
    2. If the instruction implies deleting, return an empty array or comments.
    3. Maintain the logic of the construction.
  `;
  
  const userPrompt = `
    **Full Script Context:**
    ${fullScript.join('\n')}
    
    **Selected Commands to Modify:**
    ${selectedScript}
    
    **User Instruction:**
    ${userInstruction}
  `;

  try {
    const response = await ai.models.generateContent({
      model: config.model,
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json"
      }
    });

    const text = response.text || "{}";
    const result = JSON.parse(text);
    
    return Array.isArray(result.newCommands) ? result.newCommands : [];
  } catch (error) {
    console.error("Error modifying GeoGebra commands:", error);
    throw error;
  }
}
