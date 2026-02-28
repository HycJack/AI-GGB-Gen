export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface OpenAIConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

async function makeOpenAIRequest(
  endpoint: string,
  config: OpenAIConfig
): Promise<Response> {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  const url = `${baseUrl}${endpoint}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
  });
  
  return response;
}

async function makeOpenAIChatRequest(
  messages: ChatMessage[],
  config: OpenAIConfig,
  options?: {
    responseFormat?: { type: 'json_object' | 'text' };
    temperature?: number;
  }
): Promise<string> {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  const url = `${baseUrl}/chat/completions`;
  
  const body: Record<string, any> = {
    model: config.model,
    messages: messages,
  };
  
  if (options?.responseFormat) {
    body.response_format = options.responseFormat;
  }
  if (options?.temperature !== undefined) {
    body.temperature = options.temperature;
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

export async function getAvailableModels(apiKey: string, baseUrl?: string): Promise<string[]> {
  try {
    const config: OpenAIConfig = { apiKey, baseUrl: baseUrl || DEFAULT_BASE_URL, model: '' };
    const response = await makeOpenAIRequest('/models', config);
    
    if (!response.ok) {
      console.error("Failed to list models:", response.status);
      return [];
    }
    
    const data = await response.json();
    const models: string[] = [];
    
    if (data.data && Array.isArray(data.data)) {
      for (const model of data.data) {
        if (model.id) {
          models.push(model.id);
        }
      }
    }
    
    return models.sort();
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
  config: OpenAIConfig
): Promise<GeoGebraGenerationResult> {
  const systemPrompt = `
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
        - **平面几何（2D）**：使用 坐标。常用：Point, Segment, Circle, Polygon 等。
        - **立体几何（3D）**：使用 坐标。常用：Point(x,y,z), Plane, Sphere, Polygon3D 等。
    3. **标签与显示**：
        - 使用 ShowLabel 控制标签。
        - 使用 ShowAxes(false) 和 ShowGrid(false) 隐藏坐标轴和网格（除非题目需要）。
    4. **准确性**：指令必须能复现题目图形。
  `;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  const userContent: any[] = [{ type: 'text', text: problemText }];

  if (imageBase64) {
    userContent.push({
      type: 'image_url',
      image_url: {
        url: `data:${mimeType};base64,${imageBase64}`
      }
    });
  }

  try {
    const response = await makeOpenAIChatRequest(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent as any },
      ],
      config,
      { responseFormat: { type: 'json_object' } }
    );
    
    const result = JSON.parse(response);
    
    return {
      commands: Array.isArray(result.commands) ? result.commands : [],
      perspective: result.perspective || "2",
      problemDescription: result.problemDescription || problemText || "未提供题目描述"
    };
  } catch (error) {
    console.error("Error generating GeoGebra commands:", error);
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
  config: OpenAIConfig
): Promise<string[]> {
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
    const response = await makeOpenAIChatRequest(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      config,
      { responseFormat: { type: 'json_object' } }
    );
    
    const result = JSON.parse(response);
    
    return Array.isArray(result.newCommands) ? result.newCommands : [];
  } catch (error) {
    console.error("Error modifying GeoGebra commands:", error);
    throw error;
  }
}
