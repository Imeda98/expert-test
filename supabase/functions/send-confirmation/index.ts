import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_PUBLIC_KEY") || "invalid_key");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ConfirmationEmailRequest {
  name: string;
  email: string;
  industry: string;
}

const fallbackContent = (name: string, industry: string) =>
  `Hi ${name}! 🚀 Welcome to our innovation community! We're thrilled to have someone from the ${industry} industry join us. Get ready to discover cutting-edge insights, connect with fellow innovators, and unlock new opportunities that will transform how you work. This is just the beginning of your innovation journey!`;

const generatePersonalizedContent = async (
  name: string,
  industry: string
): Promise<string> => {
  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY not set in env");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "You are an expert at writing exciting, personalized welcome emails for an innovation community. Create super short, energetic content that gets people excited about revolutionizing their industry. Keep it under 150 words total.",
          },
          {
            role: "user",
            content: `Create a personalized welcome email for ${name} who works in the ${industry} industry. Focus on how this innovation community will help them revolutionize their specific industry. Be enthusiastic and inspiring. Include industry-specific opportunities and innovations they could be part of.`,
          },
        ],
        temperature: 0.8,
        max_tokens: 200,
      }),
    });

    const rawText = await response.text();
    console.log("OpenAI raw response:", rawText);

    const data = JSON.parse(rawText);
    const content = data?.choices?.[0]?.message?.content;

    return typeof content === "string" && content.trim()
      ? content
      : fallbackContent(name, industry);
  } catch (error) {
    console.error("Error generating content:", error);
    return fallbackContent(name, industry);
  }
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let name = "",
      email = "",
      industry = "";

    // Safer JSON parsing
    try {
      const textBody = await req.text();
      console.log("Raw request body:", textBody);

      if (!textBody) throw new Error("Empty body");

      const body: ConfirmationEmailRequest = JSON.parse(textBody);
      name = body.name;
      email = body.email;
      industry = body.industry;

      if (!name || !email || !industry) {
        throw new Error("Missing required fields: name, email, or industry");
      }
    } catch (jsonError) {
      console.error("Invalid JSON input:", jsonError);
      return new Response(JSON.stringify({ error: "Invalid JSON input" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const personalizedContent = await generatePersonalizedContent(
      name,
      industry
    );

    const emailResponse = await resend.emails.send({
      from: "Innovation Community <testing-email@lovable.dev>",
      to: [email],
      subject: `Welcome to the Innovation Revolution, ${name}! 🚀`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #333; margin-bottom: 10px;">🚀 Welcome to the Innovation Revolution!</h1>
          </div>

          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; color: white; margin-bottom: 30px;">
            <div style="font-size: 18px; line-height: 1.6;">
              ${personalizedContent.replace(/\n/g, "<br>")}
            </div>
          </div>

          <div style="background: #f8f9fa; padding: 25px; border-radius: 8px; margin-bottom: 25px;">
            <h3 style="color: #333; margin-top: 0;">What's Next?</h3>
            <ul style="color: #666; line-height: 1.6;">
              <li>🎯 <strong>Exclusive insights</strong> tailored to ${industry}</li>
              <li>💡 <strong>Early access</strong> to industry-changing innovations</li>
              <li>🤝 <strong>Connect</strong> with ${industry} leaders</li>
              <li>📈 <strong>Transform</strong> your approach to ${industry} challenges</li>
            </ul>
          </div>

          <div style="text-align: center; padding: 20px 0; border-top: 1px solid #eee;">
            <p style="color: #666; margin: 0;">
              Ready to revolutionize ${industry}?<br>
              <strong>The Innovation Community Team</strong>
            </p>
          </div>
        </div>
      `,
    });

    console.log("Email response:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, emailId: emailResponse.data?.id }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-confirmation function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
