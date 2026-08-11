from typing import Annotated, Literal, Optional, Union, final
from pydantic import BaseModel, Field


@final
class schema:
  @final
  class meta:
    class Meta(BaseModel):
      # Temperature setting for the template
      temperature: float
      foobar: Optional['schema.meta.Meta_Foobar']
      zoo_bar: Optional['schema.meta.Meta_ZooBar']


    type Meta_Foobar = Literal[
      'foo',
      'bar',
    ]


    type Meta_ZooBar = Annotated[
      Union[
        'schema.meta.Meta_ZooBar_KindFoo',
        'schema.meta.Meta_ZooBar_KindBar',
      ],
      Field(discriminator="kind"),
    ]


    class Meta_ZooBar_KindFoo(BaseModel):
      kind: Literal['foo']
      foo: str


    class Meta_ZooBar_KindBar(BaseModel):
      kind: Literal['bar']
      bar: str


  @final
  class main:
    @final
    class my_template:
      class Input(BaseModel):
        """The input"""

        first_name: str
        last_name: str
        foo_to_bar: Optional[dict[str, int]]


      class Output(BaseModel):
        """
        The
        output
        """

        x: int


    @final
    class my_tool:
      class Input(BaseModel):
        foo: str
        x: Optional[int]
        y: Optional[int]


      class Output(BaseModel):
        bar: str

