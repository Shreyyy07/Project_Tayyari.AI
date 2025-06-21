import google.generativeai as genai

print("✅ Module path:", genai.__file__)
print("✅ Has 'api_endpoint'? ", 'api_endpoint' in genai.configure.__code__.co_varnames)
